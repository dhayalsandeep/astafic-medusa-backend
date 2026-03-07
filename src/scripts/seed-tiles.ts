import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

/**
 * Seed script to create AGL Tile products for testing the Order Flow.
 *
 * Run with: npx medusa exec ./src/scripts/seed-tiles.ts [vendor-user-id]
 * If no vendor ID is provided, products will be created without vendor assignment.
 */
export default async function seedAglTiles({ container, args }: ExecArgs) {
  const productService = container.resolve(Modules.PRODUCT)
  const stockLocationService = container.resolve(Modules.STOCK_LOCATION)
  const inventoryService = container.resolve(Modules.INVENTORY)
  const remoteLink = container.resolve("remoteLink")
  const query = container.resolve("query")

  // Get vendor ID from arguments (optional)
  const vendorId = args?.[0]
  if (vendorId) {
    console.log(`🔑 Assigning products to vendor: ${vendorId}`)
  } else {
    console.log(`⚠️  No vendor ID provided. Products will be created without vendor assignment.`)
  }

  console.log("🌱 Starting AGL Tiles seeding...")

  try {
    // 1. Get or create a stock location for inventory
    const stockLocations = await stockLocationService.listStockLocations()
    let stockLocationId = stockLocations[0]?.id

    if (!stockLocationId) {
      const [stockLocation] = await stockLocationService.createStockLocations([{
        name: "Main Warehouse",
      }])
      stockLocationId = stockLocation.id
      console.log(`✓ Created stock location: ${stockLocation.name}`)
    }

    const productsToCreate = [
      {
        title: "AGL Porcellanto Tuff Guard Fantasia Blue",
        subtitle: "600x1200mm Full Body",
        description: "Heavy-duty full body vitrified tile, Matt finish, scratch-resistant. Ideal for high-traffic areas.",
        handle: "agl-fantasia-blue",
        metadata: vendorId ? {
          vendor_id: vendorId,
          dimensions: "600x1200mm"
        } : {
          dimensions: "600x1200mm"
        },
        options: [
          { title: "Size", values: ["600x1200mm"] },
          { title: "Finish", values: ["Matt"] }
        ],
        variants: [
          {
            title: "600x1200mm / Matt",
            sku: "AGL-FAN-BLU-6001200-MATT",
            options: {
              "Size": "600x1200mm",
              "Finish": "Matt"
            },
            prices: [
              {
                amount: 120000, // ₹1,200.00
                currency_code: "inr"
              }
            ]
          }
        ]
      },
      {
        title: "AGL Richie Grey",
        subtitle: "600x1200mm Polished GVT",
        description: "Premium glazed vitrified tile with a high-gloss polished finish. Elegant grey stone look.",
        handle: "agl-richie-grey",
        metadata: vendorId ? {
          vendor_id: vendorId,
          dimensions: "600x1200mm"
        } : {
          dimensions: "600x1200mm"
        },
        options: [
          { title: "Size", values: ["600x1200mm"] },
          { title: "Finish", values: ["Polished"] }
        ],
        variants: [
          {
            title: "600x1200mm / Polished",
            sku: "AGL-RICHIE-GREY-6001200-POL",
            options: {
              "Size": "600x1200mm",
              "Finish": "Polished"
            },
            prices: [
              {
                amount: 145000, // ₹1,450.00
                currency_code: "inr"
              }
            ]
          }
        ]
      }
    ]

    for (const productData of productsToCreate) {
      let product;
      const existing = await productService.listProducts({
        handle: productData.handle
      }, {
        relations: ["variants"]
      })

      if (existing.length > 0) {
        console.log(`- Product ${productData.title} already exists. Checking inventory...`)
        product = existing[0]
      } else {
        // Create product using the workflow
        const { result: createdProducts } = await createProductsWorkflow(container).run({
          input: {
            products: [productData]
          }
        })
        product = createdProducts[0]
        console.log(`✓ Created product: ${product.title}`)
      }

      // Handle Inventory for each variant
      for (const variant of product.variants) {
        // Check if variant already has inventory using Query API
        const { data: variants } = await query.graph({
          entity: "product_variant",
          filters: { id: variant.id },
          fields: ["id", "inventory_items.*"]
        })

        if (variants[0]?.inventory_items?.length > 0) {
          console.log(`  ✓ Inventory already set for variant: ${variant.sku}`)
          continue
        }

        console.log(`  Setting inventory for variant: ${variant.sku}...`)

        try {
          // 1. Create inventory item
          const createdItems = await inventoryService.createInventoryItems([{
            sku: variant.sku,
          }])
          const inventoryItem = Array.isArray(createdItems) ? createdItems[0] : createdItems

          if (!inventoryItem || !inventoryItem.id) {
            throw new Error(`Failed to create inventory item for ${variant.sku}`)
          }

          // 2. Link variant to inventory item
          await remoteLink.create({
            [Modules.PRODUCT]: {
              variant_id: variant.id,
            },
            [Modules.INVENTORY]: {
              inventory_item_id: inventoryItem.id,
            },
          })

          // 3. Create inventory level
          await inventoryService.createInventoryLevels([{
            inventory_item_id: inventoryItem.id,
            stock_location_id: stockLocationId,
            stocked_quantity: 500,
          }])

          // 4. Update variant to manage inventory
          await productService.updateVariants([{
            id: variant.id,
            manage_inventory: true
          }])

          console.log(`  ✓ Successfully set inventory for variant: ${variant.sku}`)
        } catch (invError) {
          console.error(`  ❌ Failed to set inventory for ${variant.sku}:`, invError.message)
        }
      }
    }

    console.log("Created AGL Tiles")
  } catch (error) {
    console.error("❌ Failed to seed AGL Tiles:", error)
    throw error
  }
}
