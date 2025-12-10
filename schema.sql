-- Customer Affirmations D1 Database Schema
-- Quotes should be stored WITHOUT any surrounding straight or curly quotes (handled in code)
-- This file contains the SQL schema for storing customer affirmation quotes

-- Create the quotes table
CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL UNIQUE,
    added_by_id TEXT,
    text_author TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    added_at DATETIME
);

-- Create an index on the text for faster lookups
CREATE INDEX IF NOT EXISTS idx_quotes_text ON quotes(text);

-- Create the command_log table to track when users share customer affirmations
CREATE TABLE IF NOT EXISTS command_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create an index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_command_log_user_id ON command_log(user_id);

-- Create an index on created_at for faster sorting
CREATE INDEX IF NOT EXISTS idx_command_log_created_at ON command_log(created_at);

-- Insert all the customer affirmation quotes
-- All quotes below are stored without surrounding quotes (code strips both straight and curly quotes)
INSERT OR IGNORE INTO quotes (text, added_by_id, text_author) VALUES
    ("Love Team Gantt! Canʻt live without it <3", "system", "Faith Chase"),
    ("TeamGantt has been very helpful! Thank you so much for the great app.", "system", "Atsushi Kodera"),
    ("It works.", "system", "Chris Cavilla");
