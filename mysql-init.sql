-- Prisma Migrate uses temporary shadow databases during local development.
-- The application user already has full access to MYSQL_DATABASE; these
-- global DDL privileges let it create and clean up those temporary databases.
GRANT CREATE, DROP, ALTER, REFERENCES ON *.* TO 'app'@'%';
