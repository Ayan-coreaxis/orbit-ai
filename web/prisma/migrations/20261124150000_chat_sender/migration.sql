-- Inbox: tell the seller's own replies apart from the chatbot's.
ALTER TABLE "ChatMessage" ADD COLUMN "sender" TEXT;
