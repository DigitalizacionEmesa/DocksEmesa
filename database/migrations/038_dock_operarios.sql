-- Catálogo de operarios disponible para las aplicaciones Dock.
-- La tabla es idempotente para poder aplicar esta migración más de una vez.

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'dock')
BEGIN
    EXEC(N'CREATE SCHEMA dock');
END;
GO

IF OBJECT_ID(N'dock.operarios', N'U') IS NULL
BEGIN
    CREATE TABLE dock.operarios (
        num_operario NVARCHAR(50) NOT NULL,
        nombre NVARCHAR(200) NULL,
        correo NVARCHAR(320) NULL
    );
END;
GO

INSERT INTO dock.operarios (num_operario, nombre, correo)
SELECT
    u.Num_Operario,
    u.Nombre,
    u.Correo
FROM [DataLakeSCCZ].[General].[Usuarios] AS u
WHERE u.Num_Operario IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM dock.operarios AS o
    WHERE (o.num_operario = u.Num_Operario OR (o.num_operario IS NULL AND u.Num_Operario IS NULL))
      AND (o.nombre = u.Nombre OR (o.nombre IS NULL AND u.Nombre IS NULL))
      AND (o.correo = u.Correo OR (o.correo IS NULL AND u.Correo IS NULL))
);
GO
