create table if not exists match_chat_messages (
  id text primary key,
  match_id text not null,
  sender_user_id text not null references users(id) on delete cascade,
  sender_display_name text not null,
  kind text not null,
  body text,
  emote text,
  moderation_state text not null default 'visible',
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint match_chat_messages_kind_check check (kind in ('text', 'emote')),
  constraint match_chat_messages_text_body_check check (
    (kind = 'text' and body is not null and length(body) > 0 and emote is null)
    or
    (kind = 'emote' and emote in ('skull', 'sob', 'thinking', 'sunglasses') and body is null)
  )
);

create index if not exists idx_match_chat_messages_match_created
on match_chat_messages(match_id, created_at);

create index if not exists idx_match_chat_messages_sender_created
on match_chat_messages(sender_user_id, created_at desc);

create index if not exists idx_match_chat_messages_moderation
on match_chat_messages(moderation_state, created_at desc);
