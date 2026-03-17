/**
 * Integration tests for DELETE /api/diagrams/:id/bindings (US9).
 *
 * Covers T061 scenarios:
 *   1. Successful diagram-level bulk binding deletion.
 *   2. Idempotent behavior when no bindings exist.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { app } from '../../src/app';
import { User } from '../../src/models/User';
import { Diagram } from '../../src/models/Diagram';
import { DiagramBindings } from '../../src/models/DiagramBindings';
import { AuthService } from '../../src/services/auth.service';

let userToken: string;
let userId: string;

async function createDiagram(name: string) {
    return Diagram.create({
        ownerId: new mongoose.Types.ObjectId(userId),
        name,
        layout: { widgets: [] },
    });
}

beforeAll(async () => {
    await connectDatabase();
    await Promise.all([User.deleteMany({}), Diagram.deleteMany({}), DiagramBindings.deleteMany({})]);

    const user = await AuthService.register('bindings_bulk_delete@test.com', 'password1234');
    userToken = user.token;
    userId = user.user._id.toString();
});

afterAll(async () => {
    await Promise.all([User.deleteMany({}), Diagram.deleteMany({}), DiagramBindings.deleteMany({})]);
    await disconnectDatabase();
});

beforeEach(async () => {
    await Promise.all([Diagram.deleteMany({}), DiagramBindings.deleteMany({})]);
});

describe('T061 - Diagram bindings bulk delete integration', () => {
    it('deletes all bindings for a diagram and returns 204', async () => {
        const diagram = await createDiagram('Bulk Delete Target');
        const ownerObjectId = new mongoose.Types.ObjectId(userId);

        await DiagramBindings.create([
            {
                diagramId: diagram._id,
                ownerId: ownerObjectId,
                edgeServerId: new mongoose.Types.ObjectId(),
                widgetBindings: [{ widgetId: 'w1', deviceId: 'd1', metric: 'temp' }],
            },
            {
                diagramId: diagram._id,
                ownerId: ownerObjectId,
                edgeServerId: new mongoose.Types.ObjectId(),
                widgetBindings: [{ widgetId: 'w2', deviceId: 'd2', metric: 'pressure' }],
            },
        ]);

        const before = await DiagramBindings.countDocuments({ diagramId: diagram._id }).exec();
        expect(before).toBe(2);

        const res = await request(app)
            .delete(`/api/diagrams/${diagram._id.toString()}/bindings`)
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(204);

        const after = await DiagramBindings.countDocuments({ diagramId: diagram._id }).exec();
        expect(after).toBe(0);
    });

    it('is idempotent and returns 204 when bindings are already absent', async () => {
        const diagram = await createDiagram('Bulk Delete Empty');

        const initialCount = await DiagramBindings.countDocuments({ diagramId: diagram._id }).exec();
        expect(initialCount).toBe(0);

        const firstDelete = await request(app)
            .delete(`/api/diagrams/${diagram._id.toString()}/bindings`)
            .set('Authorization', `Bearer ${userToken}`);
        expect(firstDelete.status).toBe(204);

        const secondDelete = await request(app)
            .delete(`/api/diagrams/${diagram._id.toString()}/bindings`)
            .set('Authorization', `Bearer ${userToken}`);
        expect(secondDelete.status).toBe(204);

        const finalCount = await DiagramBindings.countDocuments({ diagramId: diagram._id }).exec();
        expect(finalCount).toBe(0);
    });
});
