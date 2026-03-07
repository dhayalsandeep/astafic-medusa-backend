import { MedusaApp } from "@medusajs/framework/http";

export default async function createPublishableKey() {
  const { container } = await MedusaApp({
    workerMode: "shared",
  });

  const query = container.resolve("query");

  try {
    // Create a publishable API key
    const result = await query.graph({
      entity: "publishable_api_key",
      fields: ["id", "token"],
      filters: {},
    });

    if (result.data && result.data.length > 0) {
      console.log("\n✅ Existing Publishable API Keys:");
      result.data.forEach((key: any) => {
        console.log(`   ID: ${key.id}`);
        console.log(`   Token: ${key.token}\n`);
      });
      return result.data[0].token;
    } else {
      console.log("\n⚠️  No publishable API keys found.");
      console.log("Please create one in the Medusa Admin panel:");
      console.log("1. Navigate to http://localhost:9000/app");
      console.log("2. Go to Settings → Publishable API Keys");
      console.log("3. Create a new key named 'Partner Store Frontend'");
      console.log("4. Copy the generated key\n");
    }
  } catch (error) {
    console.error("Error fetching publishable keys:", error);
  }

  process.exit(0);
}
