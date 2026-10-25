// MongoDB initialization script
// This script runs when the MongoDB container starts for the first time
// It runs as the MONGO_INITDB_ROOT_USERNAME user

// Get the root username from environment (set by MONGO_INITDB_ROOT_USERNAME)
const rootUser = process.env.MONGO_INITDB_ROOT_USERNAME || 'admin';

// Switch to admin database and grant userAdmin role to the root user
db = db.getSiblingDB('admin');
db.grantRolesToUser(rootUser, [{ role: "userAdmin", db: "test" }]);

// Switch to test database and insert sample products
db = db.getSiblingDB('test');
db.products.insertMany([
  { name: "Laptop", price: 1299.99 },
  { name: "Wireless Mouse", price: 29.99 },
  { name: "Mechanical Keyboard", price: 149.99 },
  { name: "27-inch 4K Monitor", price: 449.99 },
  { name: "USB-C Docking Station", price: 189.0 },
  { name: "Noise-Cancelling Headphones", price: 299.0 },
  { name: "HD Webcam", price: 79.99 },
  { name: "Ergonomic Office Chair", price: 349.0 },
  { name: "Portable SSD 1TB", price: 119.99 },
  { name: "Standing Desk", price: 599.0 }
]);

print('MongoDB initialization completed successfully!');
print('Root user: ' + rootUser);
print('Created test database with products collection');
print('Sample products inserted: 10 demo products');

// Made with Bob
