-- Migration 003: Adiciona coluna due_date na tabela processes
ALTER TABLE processes ADD COLUMN due_date DATE NULL;
