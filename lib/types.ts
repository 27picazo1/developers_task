export type TaskStatus = 'pending' | 'in_progress' | 'completed'
export type TaskPriority = 'low' | 'medium' | 'high'
export type TaskType = 'task' | 'bug' | 'idea' | 'improvement'

export interface Profile { id: string; email: string | null; display_name: string | null; avatar_url: string | null; created_at: string; updated_at: string }
export interface Category { id: string; user_id: string; name: string; color: string; created_at: string }
export interface Task { id: string; user_id: string; category_id: string | null; title: string; description: string | null; status: TaskStatus; priority: TaskPriority; type?: TaskType | null; created_at: string; updated_at: string; category?: Category | null; subtasks?: Subtask[]; comments?: Comment[]; attachments?: Attachment[] }
export interface Subtask { id: string; task_id: string; title: string; completed: boolean; created_at: string }
export interface Comment { id: string; task_id: string; user_id: string; content: string; created_at: string; profile?: Profile }
export interface Attachment { id: string; task_id: string; user_id: string; file_name: string; file_path: string; file_type: string; file_size: number; created_at: string }
export interface TaskWithRelations extends Task { category: Category | null; subtasks: Subtask[]; comments: (Comment & { profile: Profile })[]; attachments: Attachment[] }
export type ResourceType = 'script' | 'mlo' | 'vehicle' | 'map' | 'ui' | 'tool' | 'other'
export interface Resource { id: string; user_id: string; title: string; description: string | null; resource_type: ResourceType; url: string | null; download_url: string | null; tags: string[]; notes: string | null; created_at: string; updated_at: string }
export interface ResourceAttachment { id: string; resource_id: string; user_id: string; file_name: string; file_path: string; file_type: string; file_size: number; position: number; is_banner: boolean; created_at: string }
