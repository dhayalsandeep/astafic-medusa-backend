import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

/**
 * Update existing AGL products with vendor metadata
 *
 * Run with: npx medusa exec ./src/scripts/update-product-vendor.ts <vendor-id>
 */
export default async function updateProductVendor({ container, args }: ExecArgs) {
  const productService = container.resolve(Modules.PRODUCT)

  const vendorId = args?.[0] || "test-vendor-123"

  console.log(`🔄 Updating AGL products with vendor ID: ${vendorId}`)

  try {
    // Find AGL products individually
    const handles = ["agl-fantasia-blue", "agl-richie-grey"]
    const products: any[] = []

    for (const handle of handles) {
      const result = await productService.listProducts({ handle })
      if (result.length > 0) {
        products.push(result[0])
      }
    }

    if (products.length === 0) {
      console.log("❌ No AGL products found. Run seed-tiles.ts first.")
      return
    }

    // Update each product with vendor metadata using workflow
    for (const product of products) {
      await updateProductsWorkflow(container).run({
        input: {
          products: [{
            id: product.id,
            metadata: {
              ...product.metadata,
              vendor_id: vendorId,
              dimensions: product.metadata?.dimensions || "600x1200mm"
            }
          }]
        }
      })

      console.log(`✓ Updated ${product.title} with vendor_id: ${vendorId}`)
    }

    console.log(`\n✅ Successfully updated ${products.length} products`)
    console.log(`\nYou can now view these products at:`)
    console.log(`http://localhost:3000/vendor/inventory`)
    console.log(`\nLogin with vendor credentials to see the products.`)
  } catch (error) {
    console.error("❌ Failed to update products:", error)
    throw error
  }
}
