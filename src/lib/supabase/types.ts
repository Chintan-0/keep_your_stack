// Hand-written mirror of the schema in supabase/migrations/*.sql. If the
// project were wired to a live Supabase instance we'd generate this with
// `supabase gen types typescript`, but that requires a running project
// (see supabase/config.toml). Keep this in sync with the migrations.
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string | null;
          email: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          parent_id: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["categories"]["Row"]> & {
          user_id: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["categories"]["Row"]>;
        Relationships: [];
      };
      stacks: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string;
          icon: string;
          color: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["stacks"]["Row"]> & {
          user_id: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["stacks"]["Row"]>;
        Relationships: [];
      };
      tags: {
        Row: { id: string; user_id: string; name: string; created_at: string };
        Insert: Partial<Database["public"]["Tables"]["tags"]["Row"]> & {
          user_id: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["tags"]["Row"]>;
        Relationships: [];
      };
      resources: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          url: string;
          normalized_url: string;
          domain: string;
          description: string;
          favicon_url: string | null;
          image_url: string | null;
          resource_type: string | null;
          pricing: string | null;
          platform: string[];
          use_cases: string[];
          notes: string;
          category_id: string | null;
          is_favorite: boolean;
          is_archived: boolean;
          use_count: number;
          import_source: string | null;
          import_folder: string | null;
          import_source_id: string | null;
          description_source: string | null;
          useful_for_source: string | null;
          enrichment_status: string;
          enrichment_attempts: number;
          enrichment_attempted_at: string | null;
          needs_review_dismissed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["resources"]["Row"]> & {
          user_id: string;
          title: string;
          url: string;
          normalized_url: string;
        };
        Update: Partial<Database["public"]["Tables"]["resources"]["Row"]>;
        Relationships: [];
      };
      resource_tags: {
        Row: { resource_id: string; tag_id: string };
        Insert: Database["public"]["Tables"]["resource_tags"]["Row"];
        Update: Partial<Database["public"]["Tables"]["resource_tags"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "resource_tags_resource_id_fkey";
            columns: ["resource_id"];
            isOneToOne: false;
            referencedRelation: "resources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resource_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      resource_stacks: {
        Row: { resource_id: string; stack_id: string };
        Insert: Database["public"]["Tables"]["resource_stacks"]["Row"];
        Update: Partial<Database["public"]["Tables"]["resource_stacks"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "resource_stacks_resource_id_fkey";
            columns: ["resource_id"];
            isOneToOne: false;
            referencedRelation: "resources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resource_stacks_stack_id_fkey";
            columns: ["stack_id"];
            isOneToOne: false;
            referencedRelation: "stacks";
            referencedColumns: ["id"];
          },
        ];
      };
      resource_link_checks: {
        Row: {
          resource_id: string;
          user_id: string;
          status: string;
          http_status: number | null;
          final_url: string | null;
          redirect_count: number;
          error: string | null;
          consecutive_failures: number;
          checked_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["resource_link_checks"]["Row"]> & {
          resource_id: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["resource_link_checks"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "resource_link_checks_resource_id_fkey";
            columns: ["resource_id"];
            isOneToOne: true;
            referencedRelation: "resources";
            referencedColumns: ["id"];
          },
        ];
      };
      remembered_import_mappings: {
        Row: {
          id: string;
          user_id: string;
          folder_path: string;
          category_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["remembered_import_mappings"]["Row"]> & {
          user_id: string;
          folder_path: string;
          category_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["remembered_import_mappings"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "remembered_import_mappings_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      import_history: {
        Row: {
          id: string;
          user_id: string;
          source: string;
          filename: string | null;
          total: number;
          imported: number;
          skipped: number;
          failed: number;
          failed_items: unknown;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["import_history"]["Row"]> & {
          user_id: string;
          source: string;
        };
        Update: Partial<Database["public"]["Tables"]["import_history"]["Row"]>;
        Relationships: [];
      };
      admin_users: {
        Row: {
          user_id: string;
          granted_at: string;
          granted_by: string | null;
          note: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["admin_users"]["Row"]> & { user_id: string };
        Update: Partial<Database["public"]["Tables"]["admin_users"]["Row"]>;
        Relationships: [];
      };
      analytics_events: {
        Row: {
          id: string;
          event_type: string;
          user_id: string | null;
          anonymous_visitor_id: string | null;
          session_id: string | null;
          path: string | null;
          referrer: string | null;
          metadata: unknown;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["analytics_events"]["Row"]> & { event_type: string };
        Update: Partial<Database["public"]["Tables"]["analytics_events"]["Row"]>;
        Relationships: [];
      };
      visitor_sessions: {
        Row: {
          id: string;
          anonymous_visitor_id: string;
          session_id: string;
          first_seen_at: string;
          last_seen_at: string;
          landing_path: string | null;
          referrer: string | null;
          device_type: string | null;
          browser: string | null;
          operating_system: string | null;
          country: string | null;
          page_view_count: number;
          is_returning: boolean;
        };
        Insert: Partial<Database["public"]["Tables"]["visitor_sessions"]["Row"]> & {
          anonymous_visitor_id: string;
          session_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["visitor_sessions"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      admin_daily_timeseries: {
        Args: { p_from: string; p_to: string };
        Returns: {
          day: string;
          visitors: number;
          unique_visitors: number;
          page_views: number;
          new_users: number;
          resources_created: number;
          extension_saves: number;
          searches: number;
          imports_completed: number;
        }[];
      };
      admin_overview: {
        Args: { p_from: string; p_to: string; p_prev_from: string; p_prev_to: string };
        Returns: {
          visitors: number;
          prev_visitors: number;
          unique_visitors: number;
          prev_unique_visitors: number;
          page_views: number;
          prev_page_views: number;
          new_users: number;
          prev_new_users: number;
          total_users: number;
          resources_created: number;
          prev_resources_created: number;
          total_resources: number;
          active_users: number;
          prev_active_users: number;
          extension_saves: number;
          prev_extension_saves: number;
          imports_completed: number;
          prev_imports_completed: number;
          failed_operations: number;
          prev_failed_operations: number;
        };
      };
      admin_top_dimension: {
        Args: { p_kind: string; p_from: string; p_to: string; p_limit?: number };
        Returns: { label: string; count: number }[];
      };
      search_resources: {
        Args: { p_query: string };
        Returns: {
          resource_id: string;
          rank: number;
          matched_title: boolean;
          matched_title_prefix: boolean;
          matched_use_cases: boolean;
          matched_tags: boolean;
          matched_category: boolean;
          matched_stacks: boolean;
          matched_description: boolean;
          matched_notes: boolean;
          matched_domain: boolean;
          matched_folder: boolean;
        }[];
      };
      search_suggest_terms: {
        Args: { p_query: string };
        Returns: { term: string; similarity: number }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
