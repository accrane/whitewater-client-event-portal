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
          ghl_event_record_id: string | null;
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
          ghl_event_record_id?: string | null;
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
      };
      rooms: {
        Row: {
          id: string;
          name: string;
          color: string;
          description: string | null;
          capacity: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          color: string;
          description?: string | null;
          capacity?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["rooms"]["Insert"]>;
        Relationships: [];
      };
      coordinators: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["coordinators"]["Insert"]>;
        Relationships: [];
      };
      reservations: {
        Row: {
          id: string;
          room_id: string;
          title: string;
          status: Database["public"]["Enums"]["reservation_status"];
          start_datetime: string;
          end_datetime: string;
          notes: string | null;
          client_name: string | null;
          salesperson_name: string | null;
          coordinator_id: string | null;
          coordinator_name: string | null;
          event_id: string | null;
          source: Database["public"]["Enums"]["reservation_source"];
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          title: string;
          status?: Database["public"]["Enums"]["reservation_status"];
          start_datetime: string;
          end_datetime: string;
          notes?: string | null;
          client_name?: string | null;
          salesperson_name?: string | null;
          coordinator_id?: string | null;
          coordinator_name?: string | null;
          event_id?: string | null;
          source?: Database["public"]["Enums"]["reservation_source"];
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["reservations"]["Insert"]>;
        Relationships: [];
      };
      event_schedule_groups: {
        Row: {
          id: string;
          event_id: string;
          name: string;
          size: number | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          name: string;
          size?: number | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["event_schedule_groups"]["Insert"]>;
        Relationships: [];
      };
      event_schedule_blocks: {
        Row: {
          id: string;
          event_id: string;
          group_id: string | null;
          label: string;
          start_minutes: number;
          end_minutes: number;
          color: Database["public"]["Enums"]["schedule_block_color"];
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          group_id?: string | null;
          label: string;
          start_minutes: number;
          end_minutes: number;
          color?: Database["public"]["Enums"]["schedule_block_color"];
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["event_schedule_blocks"]["Insert"]>;
        Relationships: [];
      };
      event_schedule_items: {
        Row: {
          id: string;
          event_id: string;
          title: string;
          description: string;
          note_html: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          title: string;
          description?: string;
          note_html?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["event_schedule_items"]["Insert"]>;
        Relationships: [];
      };
      schedule_template_items: {
        Row: {
          id: string;
          title: string;
          description: string;
          note_html: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string;
          note_html?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["schedule_template_items"]["Insert"]>;
        Relationships: [];
      };
      checklist_template_sections: {
        Row: {
          id: string;
          title: string;
          content_html: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          content_html?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["checklist_template_sections"]["Insert"]>;
        Relationships: [];
      };
      event_checklist_sections: {
        Row: {
          id: string;
          event_id: string;
          title: string;
          content_html: string;
          status: Database["public"]["Enums"]["checklist_section_status"];
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          title: string;
          content_html?: string;
          status?: Database["public"]["Enums"]["checklist_section_status"];
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["event_checklist_sections"]["Insert"]>;
        Relationships: [];
      };
      event_notes: {
        Row: {
          id: string;
          event_id: string;
          title: string;
          content: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          title: string;
          content?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["event_notes"]["Insert"]>;
        Relationships: [];
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
        Relationships: [];
      };
      sf_contacts: {
        Row: {
          sf_id: string;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
          phone: string | null;
          title: string | null;
          account_id: string | null;
          account_name: string | null;
          mailing_street: string | null;
          mailing_city: string | null;
          mailing_state: string | null;
          mailing_postal_code: string | null;
          mailing_country: string | null;
          lead_source: string | null;
          description: string | null;
          owner_id: string | null;
          owner_name: string | null;
          sf_created_at: string | null;
          sf_modified_at: string | null;
          raw: Json;
          content_hash: string;
          first_pulled_at: string;
          pulled_at: string;
          push_status: Database["public"]["Enums"]["sf_push_status"];
          ghl_contact_id: string | null;
          ghl_payload: Json | null;
          pushed_at: string | null;
          pushed_hash: string | null;
          push_error: string | null;
          excluded_reason: string | null;
        };
        Insert: {
          sf_id: string;
          first_name?: string | null;
          last_name?: string | null;
          email?: string | null;
          phone?: string | null;
          title?: string | null;
          account_id?: string | null;
          account_name?: string | null;
          mailing_street?: string | null;
          mailing_city?: string | null;
          mailing_state?: string | null;
          mailing_postal_code?: string | null;
          mailing_country?: string | null;
          lead_source?: string | null;
          description?: string | null;
          owner_id?: string | null;
          owner_name?: string | null;
          sf_created_at?: string | null;
          sf_modified_at?: string | null;
          raw: Json;
          content_hash: string;
          first_pulled_at?: string;
          pulled_at?: string;
          push_status?: Database["public"]["Enums"]["sf_push_status"];
          ghl_contact_id?: string | null;
          ghl_payload?: Json | null;
          pushed_at?: string | null;
          pushed_hash?: string | null;
          push_error?: string | null;
          excluded_reason?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["sf_contacts"]["Insert"]>;
        Relationships: [];
      };
      sf_pull_runs: {
        Row: {
          id: string;
          started_at: string;
          finished_at: string | null;
          watermark: string | null;
          contacts_seen: number;
          contacts_upserted: number;
          mode: "full" | "incremental";
          error: string | null;
        };
        Insert: {
          id?: string;
          started_at?: string;
          finished_at?: string | null;
          watermark?: string | null;
          contacts_seen?: number;
          contacts_upserted?: number;
          mode: "full" | "incremental";
          error?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["sf_pull_runs"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      sf_contact_duplicates: {
        Row: Database["public"]["Tables"]["sf_contacts"]["Row"];
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: {
      portal_event_status: "draft" | "launched" | "expired" | "archived";
      checklist_item_status:
        | "not_completed"
        | "needs_review"
        | "completed"
        | "not_applicable";
      checklist_section_status: "open" | "ready_for_review" | "complete";
      upload_status: "uploaded" | "needs_review";
      reservation_status: "held" | "booked";
      reservation_source: "manual" | "ghl";
      // Text column with a check constraint, typed here as an enum for safety.
      schedule_block_color: "green" | "purple" | "yellow" | "blue" | "plain";
      integration_direction: "GHL_TO_PORTAL" | "PORTAL_TO_GHL";
      integration_status: "success" | "warning" | "error";
      // Text column with a check constraint, typed here as an enum for safety.
      sf_push_status: "staged" | "approved" | "excluded" | "pushed" | "error";
    };
  };
};
