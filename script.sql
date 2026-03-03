-- Drakon AI Database Schema (SQL Server / T-SQL)

-- Create Database if not exists (Basic check)
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'Drakon')
BEGIN
    CREATE DATABASE Drakon;
END
GO

USE Drakon;
GO

-- Chats Table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[chats]') AND type in (N'U'))
BEGIN
    CREATE TABLE chats (
        id NVARCHAR(50) PRIMARY KEY, -- UUID strings are usually 36 chars
        user_id NVARCHAR(100),
        title NVARCHAR(255),
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );
END
GO

-- Messages Table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[messages]') AND type in (N'U'))
BEGIN
    CREATE TABLE messages (
        id INT IDENTITY(1,1) PRIMARY KEY,
        chat_id NVARCHAR(50),
        role NVARCHAR(50),
        content NVARCHAR(MAX),
        created_at DATETIME DEFAULT GETDATE(),
        FOREIGN KEY(chat_id) REFERENCES chats(id)
    );
END
GO
