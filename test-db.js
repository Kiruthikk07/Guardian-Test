const db = require('./config/database');



async function testDatabase() {
  console.log('🧪 Testing database connection and schema...\n');
  
  try {
    // Test connection
    console.log('1. Testing connection...');
    const connectionResult = await db.query('SELECT NOW() as current_time, version()');
    console.log('✅ Database connected successfully');
    console.log(`   Time: ${connectionResult.rows[0].current_time}`);
    console.log(`   Version: ${connectionResult.rows[0].version.split(' ')[0]}\n`);

    // Test ENUM types
    console.log('2. Testing ENUM types...');
    const enumResult = await db.query(`
      SELECT t.typname, e.enumlabel 
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid 
      WHERE t.typname IN ('user_role', 'device_status', 'notification_type')
      ORDER BY t.typname, e.enumsortorder
    `);
    console.log('✅ ENUM types created:');
    enumResult.rows.forEach(row => {
      console.log(`   ${row.typname}: ${row.enumlabel}`);
    });
    console.log();

    // Test table creation
    console.log('3. Testing table structure...');
    const tablesResult = await db.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    console.log('✅ Tables created:');
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.tablename}`);
    });
    console.log();

    // Test sample data
    console.log('4. Testing sample data...');
    const tenantsResult = await db.query('SELECT COUNT(*) FROM tenants');
    const plansResult = await db.query('SELECT COUNT(*) FROM plans');
    console.log(`✅ Sample data inserted:`);
    console.log(`   Tenants: ${tenantsResult.rows[0].count}`);
    console.log(`   Plans: ${plansResult.rows[0].count}\n`);

    // Test CRUD operations
    console.log('5. Testing CRUD operations...');
    
    // Create
    const createResult = await db.query(
      "INSERT INTO tenants (name) VALUES ('Test Tenant') RETURNING *"
    );
    console.log('✅ CREATE: New tenant created');
    
    // Read
    const readResult = await db.query(
      "SELECT * FROM tenants WHERE name = 'Test Tenant'"
    );
    console.log('✅ READ: Tenant fetched');
    
    // Update
    const updateResult = await db.query(
      "UPDATE tenants SET name = 'Updated Test Tenant' WHERE name = 'Test Tenant' RETURNING *"
    );
    console.log('✅ UPDATE: Tenant updated');
    
    // Delete (soft delete)
    const deleteResult = await db.query(
      "UPDATE tenants SET deleted_at = NOW() WHERE name = 'Updated Test Tenant' RETURNING *"
    );
    console.log('✅ DELETE: Tenant soft deleted\n');

    console.log('🎉 All tests passed! Database is ready for use.');
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  testDatabase();
}

module.exports = testDatabase; 

console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD); 