import { Router } from 'express';
import { DiagramsController } from './diagrams.controller';
import { EdgeServersController } from './edge-servers.controller';
import { UsersController } from './users.controller';
import { authMiddleware } from './middlewares/auth.middleware';
import { requireRole } from './middlewares/role.middleware';

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
apiRouter.delete('/diagrams/:id/bindings/:edgeServerId', authMiddleware, requireRole('USER'), DiagramsController.deleteBinding);

// ── Admin: Diagram Assignment (ADMIN only) ────────────────────────────────
apiRouter.post('/diagrams/:id/assign', authMiddleware, requireRole('ADMIN'), DiagramsController.assignDiagram);

// ── Edge Servers ──────────────────────────────────────────────────────────
// GET trusted list — USER only (admins use admin-specific queries, not this endpoint)
apiRouter.get('/edge-servers', authMiddleware, requireRole('USER'), EdgeServersController.listEdgeServers);
// ADMIN-only operations
apiRouter.post('/edge-servers', authMiddleware, requireRole('ADMIN'), EdgeServersController.registerEdgeServer);
apiRouter.post('/edge-servers/:edgeId/bind', authMiddleware, requireRole('ADMIN'), EdgeServersController.bindUserToEdge);
apiRouter.delete('/edge-servers/:edgeId/bind/:userId', authMiddleware, requireRole('ADMIN'), EdgeServersController.unbindUserFromEdge);
apiRouter.get('/edge-servers/:edgeId/ping', authMiddleware, requireRole('ADMIN'), EdgeServersController.pingEdgeServer);

// ── Users (self-service) ─────────────────────────────────────────────────
apiRouter.delete('/users/me', authMiddleware, UsersController.deleteMe);

export default apiRouter;
