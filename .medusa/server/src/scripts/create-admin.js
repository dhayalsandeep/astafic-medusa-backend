"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = createAdminUser;
const utils_1 = require("@medusajs/framework/utils");
/**
 * Create admin user for Medusa
 */
async function createAdminUser(container) {
    const userModuleService = container.resolve(utils_1.Modules.USER);
    const adminEmail = "admin@astafic.com";
    try {
        // Check if admin already exists
        const existingUsers = await userModuleService.listUsers({
            email: adminEmail,
        });
        if (existingUsers.length > 0) {
            console.log(`✓ Admin user already exists: ${adminEmail}`);
            return;
        }
        // Create admin user
        const admin = await userModuleService.createUsers({
            email: adminEmail,
            first_name: "Admin",
            last_name: "Astafic",
        });
        console.log(`✓ Created admin user: ${adminEmail}`);
        console.log(`  User ID: ${admin.id}`);
    }
    catch (error) {
        console.error("Error creating admin user:", error);
        throw error;
    }
}
//# sourceMappingURL=create-admin.js.map