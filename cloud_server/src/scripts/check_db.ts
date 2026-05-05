import mongoose from 'mongoose';
import { ENV } from '../config/env';
import { EdgeServer } from '../models/EdgeServer';
import { Diagram } from '../models/Diagram';

async function check() {
    await mongoose.connect(ENV.MONGO_URI);
    const edges = await EdgeServer.find();
    const diagrams = await Diagram.find();
    console.log('Edges:', JSON.stringify(edges, null, 2));
    console.log('Diagrams:', JSON.stringify(diagrams, null, 2));
    await mongoose.disconnect();
}

check().catch(console.error);
