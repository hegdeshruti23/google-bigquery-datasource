import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import { BigQueryQueryNG } from '../../types';
import { TableSchema } from 'api';
import { getBigQueryCompletionProvider } from './bigqueryCompletionProvider';
import { ColumnDefinition, SQLEditor, TableDefinition } from '@grafana/experimental';
import { isQueryValid } from 'utils';

type Props = {
  query: BigQueryQueryNG;
  getTables: (d?: string) => Promise<TableDefinition[]>;
  getColumns: (t: string) => Promise<ColumnDefinition[]>;
  getSchema?: () => TableSchema | null;
  onChange: (value: BigQueryQueryNG) => void;
  onRunQuery: () => void;
};

export function QueryEditorRaw({
  getColumns: apiGetColumns,
  getTables: apiGetTables,
  onChange,
  onRunQuery,
  query,
}: Props) {
  const getColumns = useRef<Props['getColumns']>(apiGetColumns);
  const getTables = useRef<Props['getTables']>(apiGetTables);
  const completionProvider = useMemo(() => getBigQueryCompletionProvider({ getColumns, getTables }), []);

  useEffect(() => {
    getColumns.current = apiGetColumns;
    getTables.current = apiGetTables;
  }, [apiGetColumns, apiGetTables]);

  const processQuery = useCallback(
    (q: BigQueryQueryNG) => {
      if (isQueryValid(q) && onRunQuery) {
        onRunQuery();
      }
    },
    [onRunQuery]
  );

  const onRawQueryChange = useCallback(
    (rawSql: string) => {
      const newQuery = {
        ...query,
        rawQuery: true,
        rawSql,
      };
      onChange(newQuery);
      processQuery(newQuery);
    },
    [onChange, processQuery, query]
  );

  return (
    <SQLEditor query={query.rawSql} onChange={onRawQueryChange} language={{ id: 'bigquery', completionProvider }} />
  );
}