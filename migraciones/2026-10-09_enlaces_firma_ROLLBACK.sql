-- Deshace 2026-10-09_enlaces_firma.sql
-- (los enlaces creados dejan de funcionar; las firmas ya hechas con ellos se quedan en sus clases)
drop function if exists public.firma_enlace_firmar(text, text, bigint[], text, bigint[], text, text);
drop function if exists public.firma_enlace_ver(text, text);
drop function if exists public.crear_enlace_firma(text, bigint, bigint[], integer, text, bigint);
drop table if exists public.enlaces_firma;
