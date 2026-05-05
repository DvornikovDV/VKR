import mongoose from 'mongoose';
import { ENV } from '../config/env';
import { User } from '../models/User';
import { EdgeServer } from '../models/EdgeServer';
import { Diagram } from '../models/Diagram';

async function seed() {
    await mongoose.connect(ENV.MONGO_URI);
    
    const admin = await User.findOne({ email: 'admin@example.com' });
    if (!admin) {
        console.error('Admin user not found. Run the server first to provision it.');
        process.exit(1);
    }

    const edge = await EdgeServer.create({
        name: 'Smoke Test Edge',
        trustedUsers: [admin._id],
        createdBy: admin._id,
        lifecycleState: 'Active',
        latestCapabilitiesCatalog: {
            edgeServerId: 'smoke-edge-1',
            telemetry: [
                { deviceId: 'pump_01', metric: 'actual_state', label: 'Pump 01 State', valueType: 'boolean' }
            ],
            commands: [
                { deviceId: 'pump_01', commandType: 'set_bool', valueType: 'boolean', reportedMetric: 'actual_state', label: 'Pump 01 Control' }
            ],
            updatedAt: new Date()
        }
    });

    const diagram = await Diagram.create({
        name: 'Smoke Test Diagram',
        ownerId: admin._id,
        content: {
            images: [],
            connectionPoints: [],
            connections: [],
            widgets: [
                {
                    id: 'toggle_1',
                    type: 'toggle',
                    x: 100,
                    y: 100,
                    width: 50,
                    height: 30,
                    relativeX: 0.1,
                    relativeY: 0.1,
                    fontSize: 14,
                    color: '#000000',
                    backgroundColor: '#ffffff',
                    borderColor: '#000000',
                    label: 'Test Toggle'
                }
            ]
        }
    });

    console.log('Seeded Edge:', edge._id);
    console.log('Seeded Diagram:', diagram._id);
    
    await mongoose.disconnect();
}

seed().catch(console.error);
