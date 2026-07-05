export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      events: {
        Row: {
          id: string;
          ghl_location_id: string;
          ghl_event_record_id: string;
          ghl_contact_id: string | null;
          ghl_opportunity_id: string | null;
          status: Database["public"]["Enums"]["portal_event_status"];
          client_portal_token_hash: string | null;
          client_portal_url: string | null;
          public_expires_at: string | null;
          expired_at: string | null;
          launched_at: string | null;
          first_viewed_at: string | null;
          last_viewed_at: string | null;
          view_count: number;
          last_synced_at: string | null;
          last_sync_status: Database["public"]["Enums"]["integration_status"] | null;
          last_sync_error: string | null;
          ghl_snapshot: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ghl_location_id: string;
          ghl_event_record_id: string;
          ghl_contact_id?: string | null;
          ghl_opportunity_id?: string | null;
          status?: Database["public"]["Enums"]["portal_event_status"];
          client_portal_token_hash?: string | null;
          client_portal_url?: string | null;
          public_expires_at?: string | null;
          expired_at?: string | null;
          launched_at?: string | null;
          first_viewed_at?: string | null;
          last_viewed_at?: string | null;
          view_count?: number;
          last_synced_at?: string | null;
          last_sync_status?: Database["public"]["Enums"]["integration_status"] | null;
          last_sync_error?: string | null;
          ghl_snapshot?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["events"]["Insert"]>;
      };
      checklist_templates: {
        Row: {
          id: string;
          name: string;
          event_type: string | null;
          description: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          event_type?: string | null;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["checklist_templates"]["Insert"]>;
      };
      checklist_template_items: {
        Row: {
          id: string;
          template_id: string;
          title: string;
          description: string | null;
          item_type: string;
          required: boolean;
          client_visible: boolean;
          client_completable: boolean;
          completion_mode: string;
          due_offset_days: number | null;
          sort_order: number;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          template_id: string;
          title: string;
          description?: string | null;
          item_type: string;
          required?: boolean;
          client_visible?: boolean;
          client_completable?: boolean;
          completion_mode?: string;
          due_offset_days?: number | null;
          sort_order?: number;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["checklist_template_items"]["Insert"]>;
      };
      event_checklist_items: {
        Row: {
          id: string;
          event_id: string;
          source_template_item_id: string | null;
          title: string;
          description: string | null;
          item_type: string;
          required: boolean;
          client_visible: boolean;
          client_completable: boolean;
          completion_mode: string;
          status: Database["public"]["Enums"]["checklist_item_status"];
          due_offset_days: number | null;
          due_date_override: string | null;
          completed_at: string | null;
          completed_by: string | null;
          sort_order: number;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          source_template_item_id?: string | null;
          title: string;
          description?: string | null;
          item_type: string;
          required?: boolean;
          client_visible?: boolean;
          client_completable?: boolean;
          completion_mode: string;
          status?: Database["public"]["Enums"]["checklist_item_status"];
          due_offset_days?: number | null;
          due_date_override?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          sort_order?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["event_checklist_items"]["Insert"]>;
      };
      vendors: {
        Row: {
          id: string;
          event_id: string;
          vendor_type: string | null;
          company_name: string | null;
          contact_name: string | null;
          email: string | null;
          phone: string | null;
          notes: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          vendor_type?: string | null;
          company_name?: string | null;
          contact_name?: string | null;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["vendors"]["Insert"]>;
      };
      uploads: {
        Row: {
          id: string;
          event_id: string;
          vendor_id: string | null;
          checklist_item_id: string | null;
          file_name: string;
          file_mime_type: string;
          file_size_bytes: number;
          storage_bucket: string;
          storage_path: string;
          status: Database["public"]["Enums"]["upload_status"];
          uploaded_by: string;
          uploaded_at: string;
          metadata: Json;
        };
        Insert: {
          id?: string;
          event_id: string;
          vendor_id?: string | null;
          checklist_item_id?: string | null;
          file_name: string;
          file_mime_type: string;
          file_size_bytes: number;
          storage_bucket: string;
          storage_path: string;
          status?: Database["public"]["Enums"]["upload_status"];
          uploaded_by?: string;
          uploaded_at?: string;
          metadata?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["uploads"]["Insert"]>;
      };
      integration_logs: {
        Row: {
          id: string;
          direction: Database["public"]["Enums"]["integration_direction"];
          event_type: string;
          ghl_location_id: string | null;
          ghl_event_record_id: string | null;
          portal_event_id: string | null;
          status: Database["public"]["Enums"]["integration_status"];
          message: string;
          details: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          direction: Database["public"]["Enums"]["integration_direction"];
          event_type: string;
          ghl_location_id?: string | null;
          ghl_event_record_id?: string | null;
          portal_event_id?: string | null;
          status: Database["public"]["Enums"]["integration_status"];
          message: string;
          details?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["integration_logs"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      portal_event_status: "draft" | "launched" | "expired" | "archived";
      checklist_item_status:
        | "not_completed"
        | "needs_review"
        | "completed"
        | "not_applicable";
      upload_status: "uploaded" | "needs_review";
      integration_direction: "GHL_TO_PORTAL" | "PORTAL_TO_GHL";
      integration_status: "success" | "warning" | "error";
    };
  };
};
