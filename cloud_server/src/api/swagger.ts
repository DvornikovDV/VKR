import swaggerUi from 'swagger-ui-express';
import yaml from 'yamljs';
import path from 'path';
import { type Application } from 'express';

// openapi.yaml is kept at cloud_server root for portability
const openapiPath = path.resolve(__dirname, '../../openapi.yaml');
const swaggerDocument = yaml.load(openapiPath) as object;

export function setupSwagger(app: Application): void {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}
