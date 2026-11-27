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
    try {
      await client.query("BEGIN");
      const prior = await client.query<{order_number:string;status:string;payment_status:string;total_minor:string}>(
        "SELECT order_number,status,payment_status,total_minor::text FROM orders WHERE idempotency_key=$1",
        [input.idempotencyKey],
      );
      if (prior.rowCount) {
        await client.query("ROLLBACK");
        return reply.code(200).send({ order:prior.rows[0], reused:true, message:"This checkout request was already recorded. Use the original order confirmation." });
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
           status,payment_status,shipping_address_snapshot,payment_method,shipping_quote_required,checkout_token_hash,idempotency_key)
         VALUES ($1,$2,$3,'PKR',$4,0,0,0,$4,$5,'pending',$6::jsonb,$7,true,$8,$9)
         RETURNING id,order_number,status,payment_status,total_minor::text`,
        [number,customerId,input.email.toLowerCase(),subtotal,status,JSON.stringify(address),method,hash(accessToken),input.idempotencyKey],
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
      const provider = method === "card" ? "alfa_payment_gateway" : method;
      await client.query(
        "INSERT INTO payments (order_id,provider,amount_minor,currency,status,idempotency_key) VALUES ($1,$2,$3,'PKR','pending',$4)",
        [order.id,provider,subtotal,input.idempotencyKey],
      );
      await client.query("COMMIT");
      return reply.code(201).send({
        order:{orderNumber:order.order_number,status:order.status,paymentStatus:order.payment_status,totalMinor:order.total_minor,currency:"PKR",paymentMethod:method},
        accessToken,
        shipping:{quoteRequired:true,message:"Delivery charges are not yet configured and will be confirmed by WA before dispatch. The displayed amount is the merchandise subtotal."},
        payment:{status:"pending",bankInstructionsAvailable:false,cardGateway:"awaiting_merchant_credentials"},
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(()=>undefined);
      if (typeof error==="object" && error!==null && "code" in error && error.code==="23505") {
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
    const order=await db.query<{id:string;payment_method:string;checkout_token_hash:string|null}>(
      "SELECT id,payment_method,checkout_token_hash FROM orders WHERE order_number=$1 LIMIT 1",[orderNo],
    );
    const record=order.rows[0];
    if(!record||record.payment_method!=="bank_transfer"||!record.checkout_token_hash||hash(parsed.data.accessToken)!==record.checkout_token_hash)
      return reply.code(404).send({error:"ORDER_NOT_FOUND",message:"The order or secure upload link could not be verified."});
    const buffer=Buffer.from(parsed.data.dataBase64.replace(/^data:[^,]+,/,""),"base64");
    if(buffer.length<1||buffer.length>5*1024*1024) return reply.code(413).send({error:"PROOF_TOO_LARGE",message:"The receipt must be smaller than 5 MB."});
    const signatureOk =
      (parsed.data.mimeType==="image/jpeg" && buffer.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff]))) ||
      (parsed.data.mimeType==="image/png" && buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) ||
      (parsed.data.mimeType==="image/webp" && buffer.toString("ascii",8,12)==="WEBP") ||
      (parsed.data.mimeType==="application/pdf" && buffer.toString("ascii",0,5)==="%PDF-");
    if(!signatureOk) return reply.code(400).send({error:"INVALID_FILE_CONTENT",message:"The uploaded file does not match its declared file type."});
    await db.query(
      `INSERT INTO bank_transfer_proofs(order_id,file_name,mime_type,file_bytes)
       VALUES($1,$2,$3,$4)`,
      [record.id,safeFileName(parsed.data.fileName),parsed.data.mimeType,buffer],
    );
    return reply.code(201).send({status:"received",message:"Your transfer receipt has been securely received and is awaiting verification."});
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
    return reply.type(proof.rows[0]!.mime_type).header("Content-Disposition",'inline; filename="'+proof.rows[0]!.file_name+'"').header("X-Content-Type-Options","nosniff").send(proof.rows[0]!.file_bytes);
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
      if(row.payment_method!=="bank_transfer"||row.status!=="pending_payment"){await client.query("ROLLBACK");return reply.code(409).send({error:"ORDER_NOT_REVIEWABLE"});}
      const proof=await client.query<{id:string}>("SELECT id FROM bank_transfer_proofs WHERE order_id=$1 AND review_status='pending' ORDER BY uploaded_at DESC LIMIT 1 FOR UPDATE",[row.id]);
      if(!proof.rowCount){await client.query("ROLLBACK");return reply.code(409).send({error:"PENDING_PROOF_NOT_FOUND"});}
      if(parsed.data.decision==="approve"){
        await client.query("UPDATE bank_transfer_proofs SET review_status='approved',review_reason=$1,reviewed_by_admin_id=$2,reviewed_at=now() WHERE id=$3",[parsed.data.reason,admin.id,proof.rows[0]!.id]);
        await client.query("UPDATE payments SET status='paid',paid_at=now() WHERE order_id=$1 AND provider='bank_transfer' AND status='pending'",[row.id]);
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
}
