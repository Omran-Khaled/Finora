import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { CreateCategoryDto, UpdateCategoryDto } from './categories.dto';
import { CategoriesService } from './categories.service';
import { PaginationQuery } from '../core/pagination';
import {
  apiError,
  CategoryListResponse,
  CategoryResponse,
  validationApiError,
} from '../swagger/schemas';

const categoryExample = {
  data: {
    id: '3c2d1e0f-5a6b-4c7d-9e8f-0a1b2c3d4e5f',
    userId: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e',
    name: 'Groceries',
    type: 'EXPENSE',
    isSystem: false,
    status: 'ACTIVE',
  },
};

@ApiTags('Categories')
@ApiBearerAuth()
@Controller('categories')
@UseGuards(AuthGuard)
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @ApiOperation({
    summary: 'List categories',
    description:
      'Returns the built-in system categories (Food, Transport, Bills, Shopping, Health, Entertainment, Education, Other) together with the categories created by the authenticated user, including archived ones.',
    operationId: 'categoriesList',
  })
  @ApiOkResponse({
    description: 'System categories followed by the user categories.',
    type: CategoryListResponse,
    example: {
      data: [
        { id: '2f1e0d9c-8b7a-4f6e-8d5c-4b3a2f1e0d9c', userId: null, name: 'Food', type: 'EXPENSE', isSystem: true, status: 'ACTIVE' },
        categoryExample.data,
      ],
      meta: { nextCursor: null },
    },
  })
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor: the `id` returned as `meta.nextCursor` by the previous page.' })
  @ApiQuery({ name: 'limit', required: false, description: 'Maximum number of categories to return (default 20, max 100).' })
  @Get() async list(@Req() request: AuthenticatedRequest, @Query() page: PaginationQuery) { const result = await this.service.listPaged(request.userId, page); return { data: result.data, meta: { nextCursor: result.nextCursor } }; }

  @ApiOperation({
    summary: 'Create a category',
    description: 'Creates a user-owned category. System categories cannot be modified.',
    operationId: 'categoriesCreate',
  })
  @ApiCreatedResponse({
    description: 'The created category (`isSystem` is always `false`).',
    type: CategoryResponse,
    example: categoryExample,
  })
  @ApiResponse(validationApiError("name: name must be between 1 and 80 characters"))
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @ApiResponse(apiError(500, 'Unexpected server error.', 'INTERNAL_ERROR', 'Internal server error.'))
  @Post() async create(@Req() request: AuthenticatedRequest, @Body() dto: CreateCategoryDto) { return { data: await this.service.create(request.userId, dto.name, dto.type) }; }

  @ApiOperation({
    summary: 'Rename a category',
    description: 'Renames a user-owned category. System categories return `404` and cannot be renamed.',
    operationId: 'categoriesUpdate',
  })
  @ApiParam({
    name: 'id',
    required: true,
    description: 'Category UUID.',
    schema: { type: 'string', format: 'uuid', example: '3c2d1e0f-5a6b-4c7d-9e8f-0a1b2c3d4e5f' },
  })
  @ApiOkResponse({ description: 'The updated category.', type: CategoryResponse, example: categoryExample })
  @ApiResponse(validationApiError("name: name must be between 1 and 80 characters"))
  @ApiResponse(apiError(404, 'No user-owned category with this id exists.', 'CATEGORY_NOT_FOUND', 'Category not found.'))
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @Patch(':id') async update(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateCategoryDto) { return { data: await this.service.update(request.userId, id, dto.name) }; }

  @ApiOperation({
    summary: 'Archive a category',
    description:
      'Archives a user-owned category. It can no longer be attached to new transactions.\n\n' +
      'System categories return `404`; archiving an already archived category returns `422`.',
    operationId: 'categoriesArchive',
  })
  @ApiParam({
    name: 'id',
    required: true,
    description: 'Category UUID.',
    schema: { type: 'string', format: 'uuid', example: '3c2d1e0f-5a6b-4c7d-9e8f-0a1b2c3d4e5f' },
  })
  @ApiOkResponse({
    description: 'The category, now with `status: ARCHIVED`.',
    type: CategoryResponse,
    example: { data: { ...categoryExample.data, status: 'ARCHIVED' } },
  })
  @ApiResponse(apiError(404, 'No user-owned category with this id exists.', 'CATEGORY_NOT_FOUND', 'Category not found.'))
  @ApiResponse(apiError(422, 'The category has already been archived.', 'CATEGORY_ARCHIVED', 'The category is already archived.'))
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @Post(':id/archive') async archive(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return { data: await this.service.archive(request.userId, id) }; }
}
