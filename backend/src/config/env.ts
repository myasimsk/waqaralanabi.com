import "dotenv/config";
import { z } from "zod";
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default("127.0.0.1"),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(["true", "false"]).default("false"),
  PREVIEW_CHECKOUT_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  COMMERCE_LAUNCH_READY: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  BANK_TRANSFER_ACCOUNT_TITLE: z.string().default(""),
  BANK_TRANSFER_BANK_NAME: z.string().default(""),
  BANK_TRANSFER_IBAN: z.string().default(""),
  BANK_TRANSFER_ACCOUNT_NUMBER: z.string().default(""),
  BANK_TRANSFER_BRANCH: z.string().default(""),
  BANK_TRANSFER_CITY: z.string().default(""),
  STOREFRONT_ORIGIN: z.string().url(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info")
}).refine(
  (value) => !value.PREVIEW_CHECKOUT_ENABLED || (
    !value.COMMERCE_LAUNCH_READY &&
    value.STOREFRONT_ORIGIN === "https://waqar-al-anabi-preview.pages.dev"
  ),
  { path: ["PREVIEW_CHECKOUT_ENABLED"], message: "Preview checkout requires the staging storefront and live commerce disabled." },
);
const result = schema.safeParse(process.env);
if (!result.success) {
  console.error("Invalid environment configuration:", result.error.flatten().fieldErrors);
  throw new Error("Check backend environment variables against .env.example.");
}
export const env = result.data;
