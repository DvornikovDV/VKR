import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { User } from '../src/models/User';
import { EdgeServer } from '../src/models/EdgeServer';
import { ENV } from '../src/config/env';

/**
 * Seed script to create initial data for simulation.
 * Creates:
 * 1. Admin User (admin@test.com / admin12345)
 * 2. Regular User (user@test.com / user12345)
 * 3. Edge Server assigned to Regular User (Key: "edge-secret-key")
 */
async function seed() {
    try {
        console.log('--- Database Seeding Started ---');
        await mongoose.connect(ENV.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // 1. Clean up existing test data
        await User.deleteMany({ email: { $in: ['admin@test.com', 'user@test.com'] } });
        await EdgeServer.deleteMany({ name: 'Simulation Edge PLC' });
        console.log('ℹ️  Cleaned up old simulation data');

        const saltRounds = 12;

        // 2. Create Admin
        const adminHash = await bcrypt.hash('admin12345', saltRounds);
        await User.create({
            email: 'admin@test.com',
            passwordHash: adminHash,
            role: 'ADMIN',
            subscriptionTier: 'PRO'
        });
        console.log('✅ Created Admin: admin@test.com / admin12345');

        // 3. Create Regular User
        const userHash = await bcrypt.hash('user12345', saltRounds);
        const user = await User.create({
            email: 'user@test.com',
            passwordHash: userHash,
            role: 'USER',
            subscriptionTier: 'FREE'
        });
        console.log('✅ Created User: user@test.com / user12345');

        // 4. Create Edge Server
        // Key is "edge-secret-key"
        const apiKey = 'edge-secret-key';
        const apiKeyHash = await bcrypt.hash(apiKey, saltRounds);
        const edge = await EdgeServer.create({
            name: 'Simulation Edge PLC',
            apiKeyHash: apiKeyHash,
            isActive: true,
            trustedUsers: [user._id]
        });
        console.log(`✅ Created Edge Server: ${edge.name}`);
        console.log(`   ID: ${edge._id}`);
        console.log(`   API Key: ${apiKey}`);

        console.log('\n--- SEEDING COMPLETE ---');
        console.log(`Use these values in your simulation scripts:`);
        console.log(`User Email: user@test.com`);
        console.log(`User Password: user12345`);
        console.log(`Edge ID: ${edge._id}`);
        console.log(`Edge Key: ${apiKey}`);
        console.log('------------------------');

        await mongoose.disconnect();
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
}

seed();
