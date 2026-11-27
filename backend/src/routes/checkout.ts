import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/pool.js";
import { requireAdmin } from "./admin.js";

const checkoutSchema = z.object({
  email: z.string().trim().email().max(254),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(32),
  addressLine1: z.string().trim().min(5).max(180),
  addressLine2: z.string().trim().max(180).optional().default(""),
  city: z.string().trim().min(2).max(100),
  region: z.string().trim().max(100).optional().default(""),
  postalCode: z.string().trim().max(20).optional().default(""),
  countryCode: z.literal("PK"),
  paymentMethod: z.enum(["cod","bank_transfer","card"]),
  idempotencyKey: z.string().uuid(),
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(10) })).min(1).max(20),
}).refine((value) => new Set(value.items.map((item) => item.variantId)).size === value.items.length, {
  message: "Each product variant must appear only once.",
  path: ["items"],
});

const proofSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.enum(["image/jpeg","image/png","image/webp","application/pdf"]),
  dataBase64: z.string().min(1).max(7_000_000),
  accessToken: z.string().min(32).max(128),
});

const reviewSchema = z.object({
  decision: z.enum(["approve","reject"]),
  reason: z.string().trim().min(5).max(500),
});

const orderNumber = () => "WAA-" + new Date().toISOString().slice(0,10).replaceAll("-","") + "-" + randomBytes(5).toString("hex").toUpperCase();
const hash = (value: string) => createHash("sha256").update(value,"utf8").digest("hex");
const safeFileName = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,120) || "payment-proof";

export async function checkoutRoutes(app: FastifyInstance): Promise<void> {
  app.post("/checkout/orders", { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const parsed = checkoutSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error:"INVALID_CHECKOUT", message:"Check your contact, delivery and product details.", details:parsed.error.flatten() });
    const input = parsed.data;
    if (input.paymentMethod === "card") return reply.code(503).send({ error:"CARD_GATEWAY_NOT_CONFIGURED", message:"Card payments are coming soon. Please choose cash on delivery or bank transfer." });
    const customerToken = request.cookies["wa_customer_session"];
    let customerId: string | null = null;
    if (customerToken) {
      const customer = await db.query<{customer_id:string}>(
        `SELECT s.customer_id FROM customer_sessions s JOIN customers c ON c.id=s.customer_id
          WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND c.status='active' LIMIT 1`,
        [hash(customerToken)],
      );
      customerId = customer.rows[0]?.customer_id ?? null;
    }

    const client = await db.connect();
    const accessToken = randomBytes(32).toString("hex");
    const requestFingerprint = hash(JSON.stringify(input));
    try {
      await client.query("BEGIN");
      // Serialize requests sharing a key so simultaneous retries resolve to one order.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [input.idempotencyKey]);
      const prior = await client.query<{order_number:string;status:string;payment_status:string;total_minor:string;checkout_request_hash:string|null}>(
        "SELECT order_number,status,payment_status,total_minor::text,checkout_request_hash FROM orders WHERE idempotency_key=$1",
        [input.idempotencyKey],
      );
      if (prior.rowCount) {
        await client.query("ROLLBACK");
        if (prior.rows[0]!.checkout_request_hash && prior.rows[0]!.checkout_request_hash !== requestFingerprint) {
          return reply.code(409).send({ error:"IDEMPOTENCY_KEY_REUSED", message:"This checkout key has already been used for different order details. Refresh checkout and try again." });
        }
        const existing = prior.rows[0]!;
        return reply.code(200).send({
          order:{orderNumber:existing.order_number,status:existing.status,paymentStatus:existing.payment_status,totalMinor:existing.total_minor,currency:"PKR"},
          reused:true,
          message:"This checkout request was already recorded. Use the original order confirmation.",
        });
      }

      const ids = input.items.map((item) => item.variantId);
      const variants = await client.query<{
        id:string; product_id:string; sku:string; colour:string; size:string; stock_on_hand:number;
        reserved_quantity:number; price_minor:string; currency:string; product_name:string; product_active:boolean; variant_active:boolean;
      }>(
        `SELECT v.id,v.product_id,v.sku,v.colour,v.size,v.stock_on_hand,v.reserved_quantity,
                p.price_minor::text,p.currency,p.name AS product_name,p.is_active AS product_active,
                v.is_active AS variant_active
           FROM product_variants v JOIN catalog_products p ON p.id=v.product_id
          WHERE v.id=ANY($1::uuid[]) ORDER BY v.id FOR UPDATE OF v`,
        [ids],
      );
      if (variants.rowCount !== input.items.length) {
        await client.query("ROLLBACK");
        return reply.code(409).send({ error:"PRODUCT_UNAVAILABLE", message:"One or more selected options are no longer available. Refresh the catalogue and try again." });
      }
      const byId = new Map(variants.rows.map((row) => [row.id,row]));
      let subtotal = 0;
      for (const item of input.items) {
        const variant = byId.get(item.variantId);
        if (!variant || !variant.product_active || !variant.variant_active || variant.currency !== "PKR") {
          await client.query("ROLLBACK");
          return reply.code(409).send({ error:"PRODUCT_UNAVAILABLE", message:"One or more selected products are not available for sale." });
        }
        if (variant.stock_on_hand - variant.reserved_quantity < item.quantity) {
          await client.query("ROLLBACK");
          return reply.code(409).send({ error:"INSUFFICIENT_STOCK", message:variant.product_name+" ("+variant.colour+", "+variant.size+") does not have enough stock." });
        }
        const line = Number(variant.price_minor) * item.quantity;
        if (!Number.isSafeInteger(line) || line < 0 || subtotal + line > 2_000_000_000) {
          await client.query("ROLLBACK");
          return reply.code(400).send({ error:"INVALID_ORDER_VALUE" });
        }
        subtotal += line;
      }

      const number = orderNumber();
      const method = input.paymentMethod;
      const status = method === "cod" ? "confirmed" : "pending_payment";
      const address = {
        recipientName:input.fullName, phone:input.phone, addressLine1:input.addressLine1,
        addressLine2:input.addressLine2, city:input.city, region:input.region,
        postalCode:input.postalCode, countryCode:"PK",
      };
      const inserted = await client.query(
        `INSERT INTO orders
          (order_number,customer_id,guest_email,currency,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor,
           status,payment_status,shipping_address_snapshot,payment_method,shipping_quote_required,checkout_token_hash,idempotency_key,checkout_request_hash)
         VALUES ($1,$2,$3,'PKR',$4,0,0,0,$4,$5,'pending',$6::jsonb,$7,false,$8,$9,$10)
         RETURNING id,order_number,status,payment_status,total_minor::text`,
        [number,customerId,input.email.toLowerCase(),subtotal,status,JSON.stringify(address),method,hash(accessToken),input.idempotencyKey,requestFingerprint],
      );
      const order = inserted.rows[0]!;
      for (const item of input.items) {
        const variant = byId.get(item.variantId)!;
        const unit = Number(variant.price_minor);
        await client.query(
          `INSERT INTO order_items (order_id,product_id,variant_id,product_name_snapshot,sku_snapshot,size_snapshot,color_snapshot,quantity,unit_price_minor,line_total_minor)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [order.id,variant.product_id,variant.id,variant.product_name,variant.sku,variant.size,variant.colour,item.quantity,unit,unit*item.quantity],
        );
        await client.query("UPDATE product_variants SET reserved_quantity=reserved_quantity+$1,updated_at=now() WHERE id=$2",[item.quantity,variant.id]);
      }
      const provider = method;
      await client.query(
        "INSERT INTO payments (order_id,provider,amount_minor,currency,status,idempotency_key) VALUES ($1,$2,$3,'PKR','pending',$4)",
        [order.id,provider,subtotal,input.idempotencyKey],
      );
      await client.query("COMMIT");
      return reply.code(201).send({
        order:{orderNumber:order.order_number,status:order.status,paymentStatus:order.payment_status,totalMinor:order.total_minor,currency:"PKR",paymentMethod:method},
        accessToken,
        shipping:{quoteRequired:false,chargeMinor:0,message:"Free shipping within Pakistan. No delivery fee will be added to this order."},
        payment:{
          status:"pending",
          bankInstructionsAvailable:method==="bank_transfer",
          bankTransfer:method==="bank_transfer"?{
            accountTitle:"M/S Waqar Al Anabi",
            bankName:"Bank Alfalah",
            iban:"PK74ALFH0481001011515575",
            accountNumber:"04811011515575",
            branch:"Bank Alfalah Ghauri Town Phase IV Islamabad Branch",
            city:"Islamabad",
            instructions:"Transfer the order total shown at checkout. Shipping within Pakistan is free. Upload your transfer receipt against this order. Orders remain pending until the payment is verified by WA."
          }:undefined,
          cardGateway:"awaiting_merchant_credentials"
        },
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(()=>undefined);
      if (typeof error==="object" && error!==null && "code" in error && error.code==="23505") {
        const existing = await db.query<{order_number:string;status:string;payment_status:string;total_minor:string;checkout_request_hash:string|null}>(
          "SELECT order_number,status,payment_status,total_minor::text,checkout_request_hash FROM orders WHERE idempotency_key=$1",
          [input.idempotencyKey],
        ).catch(() => ({ rows: [], rowCount: 0 } as any));
        if (existing.rowCount) {
          const prior = existing.rows[0]!;
          if (prior.checkout_request_hash && prior.checkout_request_hash !== requestFingerprint) {
            return reply.code(409).send({error:"IDEMPOTENCY_KEY_REUSED",message:"This checkout key has already been used for different order details."});
          }
          return reply.code(200).send({
            order:{orderNumber:prior.order_number,status:prior.status,paymentStatus:prior.payment_status,totalMinor:prior.total_minor,currency:"PKR"},
            reused:true,
            message:"This checkout request was already recorded. Use the original order confirmation.",
          });
        }
        return reply.code(409).send({error:"CHECKOUT_ALREADY_SUBMITTED",message:"This checkout has already been submitted. Refresh your orders before trying again."});
      }
      request.log.error({err:error},"Checkout order creation failed");
      return reply.code(500).send({error:"CHECKOUT_FAILED",message:"We could not place this order. Please try again."});
    } finally { client.release(); }
  });

  app.post<{Params:{orderNumber:string}}>("/checkout/orders/:orderNumber/bank-transfer-proof", {config:{rateLimit:{max:5,timeWindow:"1 hour"}}}, async (request,reply) => {
    const parsed=proofSchema.safeParse(request.body);
    if(!parsed.success) return reply.code(400).send({error:"INVALID_PROOF",message:"Upload a JPG, PNG, WebP or PDF payment receipt under 5 MB."});
    const orderNo=request.params.orderNumber.trim().toUpperCase();
    const buffer=Buffer.from(parsed.data.dataBase64.replace(/^data:[^,]+,/,""),"base64");
    if(buffer.length<1||buffer.length>5*1024*1024) return reply.code(413).send({error:"PROOF_TOO_LARGE",message:"The receipt must be smaller than 5 MB."});
    const signatureOk =
      (parsed.data.mimeType==="image/jpeg" && buffer.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff]))) ||
      (parsed.data.mimeType==="image/png" && buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) ||
      (parsed.data.mimeType==="image/webp" && buffer.toString("ascii",8,12)==="WEBP") ||
      (parsed.data.mimeType==="application/pdf" && buffer.toString("ascii",0,5)==="%PDF-");
    if(!signatureOk) return reply.code(400).send({error:"INVALID_FILE_CONTENT",message:"The uploaded file does not match its declared file type."});
    const client=await db.connect();
    try {
      await client.query("BEGIN");
      const order=await client.query<{id:string;payment_method:string;status:string;payment_status:string;checkout_token_hash:string|null}>(
        "SELECT id,payment_method,status,payment_status,checkout_token_hash FROM orders WHERE order_number=$1 FOR UPDATE",[orderNo],
      );
      const record=order.rows[0];
      if(!record||record.payment_method!=="bank_transfer"||record.status!=="pending_payment"||record.payment_status!=="pending"||!record.checkout_token_hash||hash(parsed.data.accessToken)!==record.checkout_token_hash) {
        await client.query("ROLLBACK");
        return reply.code(404).send({error:"ORDER_NOT_FOUND",message:"The order or secure upload link could not be verified."});
      }
      const pending=await client.query("SELECT id FROM bank_transfer_proofs WHERE order_id=$1 AND review_status='pending' LIMIT 1",[record.id]);
      if(pending.rowCount) {
        await client.query("ROLLBACK");
        return reply.code(409).send({error:"PROOF_ALREADY_RECEIVED",message:"A receipt is already awaiting review for this order. Please wait for WA to review it."});
      }
      await client.query(
        `INSERT INTO bank_transfer_proofs(order_id,file_name,mime_type,file_bytes)
         VALUES($1,$2,$3,$4)`,
        [record.id,safeFileName(parsed.data.fileName),parsed.data.mimeType,buffer],
      );
      await client.query("COMMIT");
      return reply.code(201).send({status:"received",message:"Your transfer receipt has been securely received and is awaiting verification."});
    } catch(error) {
      await client.query("ROLLBACK").catch(()=>undefined);
      request.log.error({err:error},"Bank transfer proof upload failed");
      return reply.code(500).send({error:"PROOF_UPLOAD_FAILED",message:"We could not securely save this receipt. Please try again."});
    } finally { client.release(); }
  });


}

export async function orderAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get<{Params:{orderNumber:string}}>("/:orderNumber/bank-transfer-proof",async(request,reply)=>{
    const admin=await requireAdmin(request,reply); if(!admin)return;
    if(admin.role!=="owner"&&admin.role!=="manager"&&admin.role!=="support") return reply.code(403).send({error:"INSUFFICIENT_PERMISSIONS"});
    const proof=await db.query<{file_name:string;mime_type:string;file_bytes:Buffer}>(
      `SELECT p.file_name,p.mime_type,p.file_bytes FROM bank_transfer_proofs p
        JOIN orders o ON o.id=p.order_id WHERE o.order_number=$1 ORDER BY p.uploaded_at DESC LIMIT 1`,
      [request.params.orderNumber.toUpperCase()],
    );
    if(!proof.rowCount)return reply.code(404).send({error:"PROOF_NOT_FOUND"});
    return reply.type(proof.rows[0]!.mime_type)
      .header("Content-Disposition",'attachment; filename="'+proof.rows[0]!.file_name+'"')
      .header("X-Content-Type-Options","nosniff")
      .header("Content-Security-Policy","sandbox")
      .header("Cache-Control","private, no-store, max-age=0")
      .send(proof.rows[0]!.file_bytes);
  });

  app.patch<{Params:{orderNumber:string}}>("/:orderNumber/bank-transfer-review",async(request,reply)=>{
    const admin=await requireAdmin(request,reply); if(!admin)return;
    if(admin.role!=="owner"&&admin.role!=="manager")return reply.code(403).send({error:"INSUFFICIENT_PERMISSIONS"});
    const parsed=reviewSchema.safeParse(request.body); if(!parsed.success)return reply.code(400).send({error:"INVALID_REVIEW"});
    const client=await db.connect();
    try{
      await client.query("BEGIN");
      const order=await client.query<{id:string;status:string;payment_status:string;payment_method:string}>(
        "SELECT id,status,payment_status,payment_method FROM orders WHERE order_number=$1 FOR UPDATE",[request.params.orderNumber.toUpperCase()],
      );
      const row=order.rows[0]; if(!row){await client.query("ROLLBACK");return reply.code(404).send({error:"ORDER_NOT_FOUND"});}
      if(row.payment_method!=="bank_transfer"||row.status!=="pending_payment"||row.payment_status!=="pending"){await client.query("ROLLBACK");return reply.code(409).send({error:"ORDER_NOT_REVIEWABLE"});}
      const proof=await client.query<{id:string}>("SELECT id FROM bank_transfer_proofs WHERE order_id=$1 AND review_status='pending' ORDER BY uploaded_at DESC LIMIT 1 FOR UPDATE",[row.id]);
      if(!proof.rowCount){await client.query("ROLLBACK");return reply.code(409).send({error:"PENDING_PROOF_NOT_FOUND"});}
      if(parsed.data.decision==="approve"){
        await client.query("UPDATE bank_transfer_proofs SET review_status='approved',review_reason=$1,reviewed_by_admin_id=$2,reviewed_at=now() WHERE id=$3",[parsed.data.reason,admin.id,proof.rows[0]!.id]);
        const payment=await client.query(
          "UPDATE payments SET status='paid',paid_at=now() WHERE order_id=$1 AND provider='bank_transfer' AND status='pending' RETURNING id",
          [row.id],
        );
        if(payment.rowCount!==1) {
          await client.query("ROLLBACK");
          return reply.code(409).send({error:"PENDING_PAYMENT_NOT_FOUND",message:"The pending bank-transfer payment record could not be verified. No inventory was changed."});
        }
        const committed=await client.query(
          `UPDATE product_variants v
              SET stock_on_hand=v.stock_on_hand-i.quantity,
                  reserved_quantity=v.reserved_quantity-i.quantity,
                  updated_at=now()
             FROM order_items i
            WHERE i.order_id=$1 AND i.variant_id=v.id
              AND v.stock_on_hand>=i.quantity AND v.reserved_quantity>=i.quantity`,
          [row.id],
        );
        const expected=await client.query<{total:number;linked:number}>(
          "SELECT count(*)::int AS total,count(variant_id)::int AS linked FROM order_items WHERE order_id=$1",[row.id],
        );
        const expectedCount=Number(expected.rows[0]?.total??0);
        if(Number(expected.rows[0]?.linked??0)!==expectedCount || committed.rowCount!==expectedCount){
          await client.query("ROLLBACK");return reply.code(409).send({error:"INVENTORY_COMMIT_FAILED",message:"Reserved stock could not be safely committed. Review inventory before approving this payment."});
        }
        await client.query("UPDATE orders SET payment_status='paid',status='confirmed',updated_at=now() WHERE id=$1",[row.id]);
      }else{
        await client.query("UPDATE bank_transfer_proofs SET review_status='rejected',review_reason=$1,reviewed_by_admin_id=$2,reviewed_at=now() WHERE id=$3",[parsed.data.reason,admin.id,proof.rows[0]!.id]);
      }
      await client.query(
        "INSERT INTO admin_audit_logs(admin_user_id,action,entity_type,entity_id,reason,metadata) VALUES($1,$2,'order',$3,$4,$5::jsonb)",
        [admin.id,"order.bank_transfer_"+parsed.data.decision,row.id,parsed.data.reason,JSON.stringify({orderNumber:request.params.orderNumber})],
      );
      await client.query("COMMIT");
      return {status:parsed.data.decision==="approve"?"approved":"rejected"};
    }catch(error){await client.query("ROLLBACK").catch(()=>undefined);request.log.error({err:error},"Bank transfer review failed");return reply.code(500).send({error:"PAYMENT_REVIEW_FAILED"});}
    finally{client.release();}
  });
  app.patch<{Params:{orderNumber:string}}>("/:orderNumber/status",async(request,reply)=>{
    const admin=await requireAdmin(request,reply); if(!admin)return;
    if(!["owner","manager","fulfilment"].includes(admin.role)) return reply.code(403).send({error:"INSUFFICIENT_PERMISSIONS"});
    const parsed=z.object({status:z.enum(["processing","shipped","delivered","cancelled"]),reason:z.string().trim().min(5).max(500)}).safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:"INVALID_ORDER_UPDATE",message:"Choose a valid next status and provide an operational note."});
    const number=request.params.orderNumber.trim().toUpperCase();
    const client=await db.connect();
    try{
      await client.query("BEGIN");
      const result=await client.query<{id:string;status:string;payment_status:string;payment_method:string}>(
        "SELECT id,status,payment_status,payment_method FROM orders WHERE order_number=$1 FOR UPDATE",[number]);
      const order=result.rows[0];
      if(!order){await client.query("ROLLBACK");return reply.code(404).send({error:"ORDER_NOT_FOUND"});}
      const next=parsed.data.status;
      const allowed =
        (order.status==="pending_payment" && next==="cancelled") ||
        (order.status==="confirmed" && (next==="processing" || next==="cancelled")) ||
        (order.status==="processing" && (next==="shipped" || next==="cancelled")) ||
        (order.status==="shipped" && next==="delivered");
      if(!allowed){await client.query("ROLLBACK");return reply.code(409).send({error:"INVALID_STATUS_TRANSITION",message:"This order cannot move from "+order.status+" to "+next+"."});}
      if(next==="cancelled" && order.payment_status!=="pending"){
        await client.query("ROLLBACK");return reply.code(409).send({error:"REFUND_REQUIRED",message:"This order has a recorded payment. Use the refund process before cancelling it."});
      }
      if(next==="cancelled"){
        await client.query(
          "UPDATE bank_transfer_proofs SET review_status='rejected',review_reason='Order cancelled before payment review.',reviewed_by_admin_id=$2,reviewed_at=now() WHERE order_id=$1 AND review_status='pending'",
          [order.id,admin.id],
        );
        const released=await client.query(
          `UPDATE product_variants v
              SET reserved_quantity=v.reserved_quantity-i.quantity,updated_at=now()
             FROM order_items i
            WHERE i.order_id=$1 AND i.variant_id=v.id AND v.reserved_quantity>=i.quantity`,[order.id]);
        const expected=await client.query<{total:number;linked:number}>(
          "SELECT count(*)::int AS total,count(variant_id)::int AS linked FROM order_items WHERE order_id=$1",[order.id],
        );
        const expectedCount=Number(expected.rows[0]?.total??0);
        if(Number(expected.rows[0]?.linked??0)!==expectedCount || released.rowCount!==expectedCount){
          await client.query("ROLLBACK");return reply.code(409).send({error:"INVENTORY_RESERVATION_MISMATCH",message:"Stock reservation could not be safely released. Please contact technical support."});
        }
      }
      if(next==="shipped" && order.payment_method==="cod"){
        const consumed=await client.query(
          `UPDATE product_variants v
              SET stock_on_hand=v.stock_on_hand-i.quantity,
                  reserved_quantity=v.reserved_quantity-i.quantity,updated_at=now()
             FROM order_items i
            WHERE i.order_id=$1 AND i.variant_id=v.id
              AND v.stock_on_hand>=i.quantity AND v.reserved_quantity>=i.quantity`,[order.id]);
        const expected=await client.query<{total:number;linked:number}>(
          "SELECT count(*)::int AS total,count(variant_id)::int AS linked FROM order_items WHERE order_id=$1",[order.id],
        );
        const expectedCount=Number(expected.rows[0]?.total??0);
        if(Number(expected.rows[0]?.linked??0)!==expectedCount || consumed.rowCount!==expectedCount){
          await client.query("ROLLBACK");return reply.code(409).send({error:"INVENTORY_COMMIT_FAILED",message:"Stock could not be safely committed for shipment. Review inventory before retrying."});
        }
      }
      await client.query("UPDATE orders SET status=$1,updated_at=now() WHERE id=$2",[next,order.id]);
      await client.query(
        "INSERT INTO admin_audit_logs(admin_user_id,action,entity_type,entity_id,reason,metadata) VALUES($1,$2,'order',$3,$4,$5::jsonb)",
        [admin.id,"order.status_"+next,order.id,parsed.data.reason,JSON.stringify({orderNumber:number,previousStatus:order.status,newStatus:next,paymentMethod:order.payment_method})]);
      await client.query("COMMIT");
      return {status:"updated",orderNumber:number,previousStatus:order.status,newStatus:next};
    }catch(error){await client.query("ROLLBACK").catch(()=>undefined);request.log.error({err:error},"Order status update failed");return reply.code(500).send({error:"ORDER_STATUS_UPDATE_FAILED"});}
    finally{client.release();}
  });
}
