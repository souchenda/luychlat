-- The bot now defaults to Khmer: an English phone setting no longer picks
-- English. Chats that got English that way at link time move to Khmer once;
-- anyone can switch with /lang (buttons) or /en, /zh, /km.
update public.telegram_links set language = 'km' where language = 'en';
