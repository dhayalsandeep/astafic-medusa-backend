"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = seedTradePrices;
const utils_1 = require("@medusajs/framework/utils");
/**
 * Seed script to initialize Trade Partners customer group and pricing
 *
 * Run with: npx medusa exec ./src/scripts/seed-trade-prices.ts
 */
async function seedTradePrices(container) {
    const customerGroupModuleService = container.resolve(utils_1.Modules.CUSTOMER);
    const pricingModuleService = container.resolve(utils_1.Modules.PRICING);
    const productModuleService = container.resolve(utils_1.Modules.PRODUCT);
    const query = container.resolve("query");
    console.log("🌱 Starting Trade Partners seed...");
    try {
        // 1. Create "Trade Partners" Customer Group
        console.log("Creating Trade Partners customer group...");
        let tradePartnersGroup;
        try {
            // Check if group already exists
            const existingGroups = await customerGroupModuleService.listCustomerGroups({
                name: "Trade Partners",
            });
            if (existingGroups.length > 0) {
                tradePartnersGroup = existingGroups[0];
                console.log("✓ Trade Partners group already exists");
            }
            else {
                tradePartnersGroup = await customerGroupModuleService.createCustomerGroups({
                    name: "Trade Partners",
                    metadata: {
                        description: "Contractors and trade professionals eligible for wholesale pricing",
                        discount_percentage: 15,
                    },
                });
                console.log("✓ Created Trade Partners customer group");
            }
        }
        catch (error) {
            console.error("Error creating customer group:", error);
            throw error;
        }
        // 2. Create "Trade Pricing" Price List
        console.log("Creating Trade Pricing price list...");
        let tradePriceList;
        try {
            // Check if price list already exists (filter by id, then check title manually)
            const existingPriceLists = await pricingModuleService.listPriceLists();
            const foundPriceList = existingPriceLists.find((pl) => pl.title === "Trade Pricing");
            if (foundPriceList) {
                tradePriceList = foundPriceList;
                console.log("✓ Trade Pricing list already exists");
            }
            else {
                const [createdPriceList] = await pricingModuleService.createPriceLists([
                    {
                        title: "Trade Pricing",
                        description: "Wholesale pricing for trade partners with 15-20% discount",
                        type: "override", // OVERRIDE type replaces base prices
                        status: "active",
                        rules: {
                            customer_group_id: [tradePartnersGroup.id],
                        },
                    },
                ]);
                tradePriceList = createdPriceList;
                console.log("✓ Created Trade Pricing price list");
            }
        }
        catch (error) {
            console.error("Error creating price list:", error);
            throw error;
        }
        // 3. Apply discounted prices to all existing products
        console.log("Applying trade pricing to products...");
        const products = await productModuleService.listProducts({}, {
            relations: ["variants"],
        });
        console.log(`Found ${products.length} products`);
        let updatedCount = 0;
        for (const product of products) {
            for (const variant of product.variants || []) {
                try {
                    // Get the price set for this variant using Query API
                    const { data: variantPricing } = await query.graph({
                        entity: "variant",
                        fields: ["id", "price_set.prices.*"],
                        filters: { id: variant.id },
                    });
                    if (!variantPricing || variantPricing.length === 0 || !variantPricing[0].price_set) {
                        console.log(`⚠ Skipping variant ${variant.id} - no price set found`);
                        continue;
                    }
                    // Get the base price (assuming USD currency)
                    const basePrice = variantPricing[0].price_set.prices?.find((p) => p.currency_code === "usd" && !p.price_list_id);
                    if (!basePrice || !basePrice.amount) {
                        console.log(`⚠ Skipping variant ${variant.id} - no base USD price found`);
                        continue;
                    }
                    // Calculate trade price (15% discount)
                    const discountPercentage = 15;
                    const tradePrice = Math.round(basePrice.amount * (1 - discountPercentage / 100));
                    // Add trade price to the price list
                    await pricingModuleService.addPriceListPrices([
                        {
                            price_list_id: tradePriceList.id,
                            prices: [
                                {
                                    price_set_id: variantPricing[0].price_set.id,
                                    currency_code: "usd",
                                    amount: tradePrice,
                                    min_quantity: 1,
                                },
                            ],
                        },
                    ]);
                    updatedCount += 1;
                    console.log(`✓ Added trade price for ${product.title} - ${variant.title}: $${(basePrice.amount / 100).toFixed(2)} → $${(tradePrice / 100).toFixed(2)} (${discountPercentage}% off)`);
                }
                catch (error) {
                    console.error(`Error adding price for variant ${variant.id}:`, error);
                }
            }
        }
        console.log(`\n✅ Seed completed successfully!`);
        console.log(`   - Customer Group: ${tradePartnersGroup.name} (${tradePartnersGroup.id})`);
        console.log(`   - Price List: ${tradePriceList.title} (${tradePriceList.id})`);
        console.log(`   - Updated ${updatedCount} product variants with trade pricing`);
        console.log(`\n💡 To add a customer to Trade Partners:`);
        console.log(`   Use the Medusa Admin Dashboard or API to add customers to the group`);
    }
    catch (error) {
        console.error("❌ Seed failed:", error);
        throw error;
    }
}
//# sourceMappingURL=seed-trade-prices.js.map