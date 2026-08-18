import { asyncHandler, ok } from '../app.module';
import type { ProjectGeographyService } from './project-geography.service';
import type { ListProjectGeographyQuery } from './dto/list-project-geography.dto';

/**
 * Project↔geography-unit scoping request handlers. Mounted under the global
 * `api/v1` prefix by `project-geography.routes.ts`.
 */
export function createProjectGeographyController(service: ProjectGeographyService) {
  return {
    list: asyncHandler(async (req, res) => {
      const { projectId } = req.query as unknown as ListProjectGeographyQuery;
      res.json(ok(await service.list(projectId)));
    }),
  };
}
