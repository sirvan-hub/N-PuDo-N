import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { createDatabaseOptions } from './database-options';

const AppDataSource = new DataSource(createDatabaseOptions());

export default AppDataSource;
