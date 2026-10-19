'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import type { Category, CategoryType } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Plus,
  Tags,
  Pencil,
  Archive,
  Loader2,
  Lock,
} from 'lucide-react';
import { trackScreenOpened } from '@/lib/telemetry';
import { toast } from 'sonner';

export default function CategoriesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createType, setCreateType] = useState<CategoryType>('EXPENSE');
  const [creating, setCreating] = useState(false);

  // Edit dialog
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  const [editing, setEditing] = useState(false);

  // Archive
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.categories.list();
      setCategories(data);
    } catch {
      setError("We couldn't load your categories.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    trackScreenOpened('categories');
  }, [load]);

  const systemCategories = categories.filter((c) => c.isSystem && c.status === 'ACTIVE');
  const userCategories = categories.filter((c) => !c.isSystem && c.status === 'ACTIVE');
  const archivedCategories = categories.filter((c) => c.status === 'ARCHIVED');

  async function handleCreate() {
    if (!createName.trim()) {
      toast.error('Please enter a category name.');
      return;
    }
    setCreating(true);
    try {
      await api.categories.create({
        name: createName.trim(),
        type: createType,
      });
      toast.success('Category created.');
      setCreateOpen(false);
      setCreateName('');
      load();
    } catch {
      toast.error('Unable to create category.');
    } finally {
      setCreating(false);
    }
  }

  async function handleEditSave() {
    if (!editCategory) return;
    if (!editName.trim()) {
      toast.error('Category name cannot be empty.');
      return;
    }
    setEditing(true);
    try {
      await api.categories.update(editCategory.id, { name: editName.trim() });
      toast.success('Category updated.');
      setEditCategory(null);
      load();
    } catch {
      toast.error('Unable to update category.');
    } finally {
      setEditing(false);
    }
  }

  async function handleArchive() {
    if (!archiveId) return;
    setArchiving(true);
    try {
      await api.categories.archive(archiveId);
      toast.success('Category archived.');
      setArchiveId(null);
      load();
    } catch {
      toast.error('Unable to archive category.');
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Organize your transactions with categories."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="me-2 h-4 w-4" />
            Add Category
          </Button>
        }
      />

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      )}

      {error && !loading && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && (
        <>
          {/* System categories */}
          {systemCategories.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                System Categories
              </h2>
              <div className="space-y-2">
                {systemCategories.map((cat) => (
                  <Card key={cat.id} className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Tags className="h-4 w-4" strokeWidth={1.5} />
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {cat.name}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        System
                      </Badge>
                    </div>
                    <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* User categories */}
          <div className="mb-8">
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              Your Categories
            </h2>
            {userCategories.length === 0 ? (
              <EmptyState
                icon={Tags}
                title="No custom categories yet"
                description="Create custom categories to organize your transactions beyond the system defaults."
                actionLabel="Add Category"
                onAction={() => setCreateOpen(true)}
              />
            ) : (
              <div className="space-y-2">
                {userCategories.map((cat) => (
                  <Card
                    key={cat.id}
                    className="flex items-center justify-between p-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/8 text-primary">
                        <Tags className="h-4 w-4" strokeWidth={1.5} />
                      </span>
                      <div>
                        <span className="text-sm font-medium text-foreground">
                          {cat.name}
                        </span>
                        <p className="text-xs text-muted-foreground capitalize">
                          {cat.type.toLowerCase()}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditCategory(cat);
                          setEditName(cat.name);
                        }}
                        aria-label="Edit category"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog
                        open={archiveId === cat.id}
                        onOpenChange={(open) =>
                          setArchiveId(open ? cat.id : null)
                        }
                      >
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            aria-label="Archive category"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Archive this category?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Archived categories are hidden from new
                              transactions. Existing transactions keep their
                              category.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleArchive}
                              disabled={archiving}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {archiving && (
                                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                              )}
                              Archive
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Archived */}
          {archivedCategories.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Archived
              </h2>
              <div className="space-y-2">
                {archivedCategories.map((cat) => (
                  <Card key={cat.id} className="flex items-center p-4 opacity-60">
                    <span className="text-sm font-medium text-muted-foreground">
                      {cat.name}
                    </span>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New category</DialogTitle>
            <DialogDescription>
              Create a custom category for your transactions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                placeholder="e.g. Groceries, Subscriptions"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-type">Type</Label>
              <Select
                value={createType}
                onValueChange={(v) => setCreateType(v as CategoryType)}
              >
                <SelectTrigger id="cat-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXPENSE">Expense</SelectItem>
                  <SelectItem value="INCOME">Income</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              Create category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={editCategory !== null}
        onOpenChange={(open) => !open && setEditCategory(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit category</DialogTitle>
            <DialogDescription>
              Update the name of this category.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-cat-name">Name</Label>
              <Input
                id="edit-cat-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCategory(null)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={editing}>
              {editing && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
