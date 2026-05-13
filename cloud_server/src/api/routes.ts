import { Router } from 'express';
import { DiagramsController } from './diagrams.controller';
import { EdgeServersController } from './edge-servers.controller';
import { UsersController } from './users.controller';
import { AdminController } from './admin.controller';
import { CommandsController } from './commands.controller';
import { AlarmIncidentsController } from './alarm-incidents.controller';
import { TelemetryController } from './telemetry.controller';
import { authMiddleware } from './middlewares/auth.middleware';
import { requireRole } from './middlewares/role.middleware';
import { commandRateLimit } from './commands.rate-limit';

// Mounted at /api in app.ts — all paths here become /api/*
const apiRouter = Router();

// ── Diagrams (JWT protected) ──────────────────────────────────────────────
apiRouter.get('/diagrams', authMiddleware, DiagramsController.listDiagrams);
apiRouter.post('/diagrams', authMiddleware, DiagramsController.createDiagram);
apiRouter.get('/diagrams/:id', authMiddleware, DiagramsController.getDiagram);
apiRouter.put('/diagrams/:id', authMiddleware, DiagramsController.updateDiagram);
apiRouter.delete('/diagrams/:id', authMiddleware, DiagramsController.deleteDiagram);

// ── DiagramBindings (USER only: admins don't operate equipment) ───────────
apiRouter.get('/diagrams/:id/bindings', authMiddleware, requireRole('USER'), DiagramsController.listBindings);
apiRouter.post('/diagrams/:id/bindings', authMiddleware, requireRole('USER'), DiagramsController.upsertBindings);
apiRouter.delete('/diagrams/:id/bindings', authMiddleware, requireRole('USER'), DiagramsController.deleteAllBindings);
apiRouter.delete('/diagrams/:id/bindings/:edgeServerId', authMiddleware, requireRole('USER'), DiagramsController.deleteBinding);

// ── Admin: Diagram Assignment (ADMIN only) ────────────────────────────────
apiRouter.post('/diagrams/:id/assign', authMiddleware, requireRole('ADMIN'), DiagramsController.assignDiagram);

// ── Edge Servers ──────────────────────────────────────────────────────────
// GET trusted list — USER only (admins use /admin/edge-servers, not this endpoint)
apiRouter.get('/edge-servers', authMiddleware, requireRole('USER'), EdgeServersController.listEdgeServers);
// ADMIN-only operations
apiRouter.post('/edge-servers', authMiddleware, requireRole('ADMIN'), EdgeServersController.registerEdgeServer);
apiRouter.post('/edge-servers/:edgeId/bind', authMiddleware, requireRole('ADMIN'), EdgeServersController.bindUserToEdge);
apiRouter.delete('/edge-servers/:edgeId/bind/:userId', authMiddleware, requireRole('ADMIN'), EdgeServersController.unbindUserFromEdge);
apiRouter.post(
    '/edge-servers/:edgeId/rotate-credential',
    authMiddleware,
    requireRole('ADMIN'),
    EdgeServersController.rotateEdgeCredential,
);
apiRouter.post(
    '/edge-servers/:edgeId/block',
    authMiddleware,
    requireRole('ADMIN'),
    EdgeServersController.blockEdgeServer,
);
apiRouter.post(
    '/edge-servers/:edgeId/unblock',
    authMiddleware,
    requireRole('ADMIN'),
    EdgeServersController.unblockEdgeServer,
);
apiRouter.get('/edge-servers/:edgeId/catalog', authMiddleware, requireRole('USER'), EdgeServersController.getEdgeServerCatalog);
apiRouter.get('/edge-servers/:edgeId/ping', authMiddleware, requireRole('ADMIN'), EdgeServersController.pingEdgeServer);

// Telemetry history (USER only: trusted Edge access validated inside service)
apiRouter.get(
    '/telemetry/historic',
    authMiddleware,
    requireRole('USER'),
    TelemetryController.getHistoricTelemetry,
);

// ── Commands (USER only: trusted access validated inside controller) ──────────
apiRouter.post(
    '/edge-servers/:edgeId/commands',
    commandRateLimit,
    authMiddleware,
    requireRole('USER'),
    CommandsController.executeCommand,
);
apiRouter.get(
    '/edge-servers/:edgeId/alarm-incidents',
    authMiddleware,
    requireRole('USER'),
    AlarmIncidentsController.listIncidents,
);
apiRouter.post(
    '/edge-servers/:edgeId/alarm-incidents/:incidentId/ack',
    authMiddleware,
    requireRole('USER'),
    AlarmIncidentsController.ackIncident,
);

// ── Users (self-service) ──────────────────────────────────────────────────
apiRouter.get('/users/me', authMiddleware, UsersController.getMe);
apiRouter.delete('/users/me', authMiddleware, UsersController.deleteMe);
apiRouter.get('/users/me/stats', authMiddleware, UsersController.getStats);
apiRouter.patch('/users/me/password', authMiddleware, UsersController.changePassword);
apiRouter.post('/users/me/password', authMiddleware, UsersController.changePassword);

// ── Admin: User Management ─────────────────────────────────────────────────
apiRouter.get('/admin/users', authMiddleware, requireRole('ADMIN'), AdminController.listUsers);
apiRouter.patch('/admin/users/:id/tier', authMiddleware, requireRole('ADMIN'), AdminController.updateUserTier);
apiRouter.patch('/admin/users/:id/status', authMiddleware, requireRole('ADMIN'), AdminController.updateUserStatus);

// ── Admin: Global Edge Fleet ─────────────────────────────────────────────
apiRouter.get('/admin/edge-servers', authMiddleware, requireRole('ADMIN'), EdgeServersController.listAdminEdgeServers);

export default apiRouter;
