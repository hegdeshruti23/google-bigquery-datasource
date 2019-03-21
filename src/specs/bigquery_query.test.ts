import BigQueryQuery from '../bigquery_query';

describe('BigQueryQuery', () => {
    const templateSrv = {
        replace: jest.fn(text => text),
    };

    describe('When initializing', () => {
        it('should not be in SQL mode', () => {
            const query = new BigQueryQuery({}, templateSrv);
            expect(query.target.rawQuery).toBe(false);
        });
        it('should be in SQL mode for pre query builder queries', () => {
            const query = new BigQueryQuery({rawSql: 'SELECT 1'}, templateSrv);
            expect(query.target.rawQuery).toBe(true);
        });
    });

    describe('When generating time column SQL', () => {
        const query = new BigQueryQuery({}, templateSrv);

        query.target.timeColumn = 'time';
        expect(query.buildTimeColumn()).toBe('time AS time');
        query.target.timeColumn = '"time"';
        expect(query.buildTimeColumn()).toBe('"time" AS time');
    });

    describe('When generating time column SQL with group by time', () => {
        let query = new BigQueryQuery(
            {timeColumn: 'time', group: [{type: 'time', params: ['5m', 'none']}]},
            templateSrv
        );
        expect(query.buildTimeColumn()).toBe('$__timeGroupAlias(time,5m)');
        expect(query.buildTimeColumn(false)).toBe('$__timeGroup(time,5m)');

        query = new BigQueryQuery({timeColumn: 'time', group: [{type: 'time', params: ['5m', 'NULL']}]}, templateSrv);
        expect(query.buildTimeColumn()).toBe('$__timeGroupAlias(time,5m,NULL)');

        query = new BigQueryQuery(
            {timeColumn: 'time', timeColumnType: 'int4', group: [{type: 'time', params: ['5m', 'none']}]},
            templateSrv
        );
    });

    describe('When generating metric column SQL', () => {
        const query = new BigQueryQuery({}, templateSrv);
        expect(query.buildMetricColumn()).toBe('');
        query.target.metricColumn = 'host';
        expect(query.buildMetricColumn()).toBe('host AS metric');
        query.target.metricColumn = '"host"';
        expect(query.buildMetricColumn()).toBe('"host" AS metric');
    });

    describe('When generating value column SQL', () => {
        const query = new BigQueryQuery({}, templateSrv);
        let column = [{type: 'column', params: ['value']}];
        expect(query.buildValueColumn(column)).toBe('value');
        column = [{type: 'column', params: ['value']}, {type: 'alias', params: ['alias']}];
        expect(query.buildValueColumn(column)).toBe('value AS alias');
        column = [
            {type: 'column', params: ['v']},
            {type: 'alias', params: ['a']},
            {type: 'aggregate', params: ['max']},
        ];
        expect(query.buildValueColumn(column)).toBe('max(v) AS a');
        column = [
            {type: 'column', params: ['v']},
            {type: 'alias', params: ['a']},
            {type: 'window', params: ['increase']},
        ];
        expect(query.buildValueColumn(column)).toBe(
            'v as tmpv, (CASE WHEN v >= lag(v) OVER (ORDER BY -- time --) ' +
            'THEN v - lag(v) OVER (ORDER BY -- time --) ' +
            'WHEN lag(v) OVER (ORDER BY -- time --) IS NULL THEN NULL ELSE v END) AS a'
        );

        column = [
            {type: 'column', params: ['v']},
            {type: 'alias', params: ['a']},
            {type: 'window', params: ['delta']},
        ];
        expect(query.buildValueColumn(column)).toBe(
            'v as tmpv, v - lag(v) OVER (ORDER BY -- time --) AS a'
        );
        column = [
            {type: 'column', params: ['v']},
            {type: 'alias', params: ['a']},
            {type: 'window', params: ['rate']},
        ];
        query.target.timeColumn = "timC";
        expect(query.buildValueColumn(column)).toBe(
            'v as tmpv, (CASE WHEN v >= lag(v) OVER (ORDER BY timC) THEN v - lag(v) OVER (ORDER BY timC) WHEN lag(v) OVER (ORDER BY timC) IS NULL THEN NULL ELSE v END)/(UNIX_SECONDS(timC) -UNIX_SECONDS(  lag(timC) OVER (ORDER BY timC))) AS a'
        );
        column = [
            {type: 'column', params: ['v']},
            {type: 'alias', params: ['a']},
            {type: 'window', params: ['rate']},
            {type: 'aggregate', params: ['first']},
        ];
        query.target.timeColumn = "timC";
        expect(query.buildValueColumn(column)).toBe(
            "first(v,timC) as tmpv, (CASE WHEN first(v,timC) >= lag(first(v,timC)) OVER (ORDER BY timC) THEN first(v,timC) - lag(first(v,timC)) OVER (ORDER BY timC) WHEN lag(first(v,timC)) OVER (ORDER BY timC) IS NULL THEN NULL ELSE first(v,timC) END)/(UNIX_SECONDS(min(timC)) -UNIX_SECONDS(  lag(min(timC)) OVER (ORDER BY timC))) AS a"
        );
        column = [
            {type: 'column', params: ['v']},
            {type: 'alias', params: ['a']},
            {type: 'window', params: ['rate']},
            {type: 'percentile', params: ['p1', 'p2']},
        ];
        query.target.timeColumn = "timC";
        expect(query.buildValueColumn(column)).toBe(
            "p1(p2) WITHIN GROUP (ORDER BY v) as tmpv, (CASE WHEN p1(p2) WITHIN GROUP (ORDER BY v) >= lag(p1(p2) WITHIN GROUP (ORDER BY v)) OVER (ORDER BY timC) THEN p1(p2) WITHIN GROUP (ORDER BY v) - lag(p1(p2) WITHIN GROUP (ORDER BY v)) OVER (ORDER BY timC) WHEN lag(p1(p2) WITHIN GROUP (ORDER BY v)) OVER (ORDER BY timC) IS NULL THEN NULL ELSE p1(p2) WITHIN GROUP (ORDER BY v) END)/(UNIX_SECONDS(min(timC)) -UNIX_SECONDS(  lag(min(timC)) OVER (ORDER BY timC))) AS a"
        );

        column = [
            {type: 'column', params: ['v']},
            {type: 'alias', params: ['a']},
            {type: 'moving_window', params: ['moving_window']},
        ];
        expect(query.buildValueColumn(column)).toBe(
            'v as tmpv, v as tmpv, moving_window(v) OVER (ORDER BY timC ROWS undefined PRECEDING) AS a'
        );


    });

    describe('When generating value column SQL with metric column', () => {
        const query = new BigQueryQuery({}, templateSrv);
        query.target.metricColumn = 'host';

        let column = [{type: 'column', params: ['value']}];
        expect(query.buildValueColumn(column)).toBe('value');
        column = [{type: 'column', params: ['value']}, {type: 'alias', params: ['alias']}];
        expect(query.buildValueColumn(column)).toBe('value AS alias');
        column = [
            {type: 'column', params: ['v']},
            {type: 'alias', params: ['a']},
            {type: 'aggregate', params: ['max']},
        ];
        expect(query.buildValueColumn(column)).toBe('max(v) AS a');
        column = [
            {type: 'column', params: ['v']},
            {type: 'alias', params: ['a']},
            {type: 'window', params: ['increase']},
        ];
        expect(query.buildValueColumn(column)).toBe(
            'v as tmpv, (CASE WHEN v >= lag(v) OVER (PARTITION BY host ORDER BY -- time --) ' +
            'THEN v - lag(v) OVER (PARTITION BY host ORDER BY -- time --) ' +
            'WHEN lag(v) OVER (PARTITION BY host ORDER BY -- time --) IS NULL THEN NULL ELSE v END) AS a'
        );
        column = [
            {type: 'column', params: ['v']},
            {type: 'alias', params: ['a']},
            {type: 'aggregate', params: ['max']},
            {type: 'window', params: ['increase']},
        ];
        expect(query.buildValueColumn(column)).toBe(
            'max(v) as tmpv, (CASE WHEN max(v) >= lag(max(v)) OVER (PARTITION BY host ORDER BY -- time --) ' +
            'THEN max(v) - lag(max(v)) OVER (PARTITION BY host ORDER BY -- time --) ' +
            'WHEN lag(max(v)) OVER (PARTITION BY host ORDER BY -- time --) IS NULL THEN NULL ELSE max(v) END) AS a'
        );
    });

    describe('When generating WHERE clause', () => {
        const query = new BigQueryQuery({where: []}, templateSrv);

        expect(query.buildWhereClause()).toBe('');

        query.target.timeColumn = 't';
        query.target.where = [{type: 'macro', name: '$__timeFilter'}];
        expect(query.buildWhereClause()).toBe('\nWHERE\n  $__timeFilter(t)');

        query.target.where = [{type: 'expression', params: ['v', '=', '1']}];
        expect(query.buildWhereClause()).toBe('\nWHERE\n  v = 1');

        query.target.where = [{type: 'macro', name: '$__timeFilter'}, {type: 'expression', params: ['v', '=', '1']}];
        expect(query.buildWhereClause()).toBe('\nWHERE\n  $__timeFilter(t) AND\n  v = 1');
    });

    describe('When generating GROUP BY clause', () => {
        const query = new BigQueryQuery({group: [], metricColumn: 'none'}, templateSrv);

        expect(query.buildGroupClause()).toBe('');
        query.target.group = [{type: 'time', params: ['5m']}];
        expect(query.buildGroupClause()).toBe('\nGROUP BY 1');
        query.target.metricColumn = 'm';
        expect(query.buildGroupClause()).toBe('\nGROUP BY 1,2');
    });

    describe('When generating complete statement', () => {
        const target = {
            timeColumn: 't',
            table: 'table',
            select: [[{type: 'column', params: ['value']}]],
            where: [],
        };
        let result = '#standardSQL\nSELECT\n t AS time,\n  value\nFROM undefined.table\nORDER BY 1';
        const query = new BigQueryQuery(target, templateSrv);

        expect(query.buildQuery()).toBe(result);

        query.target.metricColumn = 'm';
        result = '#standardSQL\nSELECT\n t AS time,\n  m AS metric,\n  value\nFROM undefined.table\nORDER BY 1,2';
        expect(query.buildQuery()).toBe(result);
    });

    describe('escapeLiteral', () => {
        let res = BigQueryQuery.escapeLiteral("'a");
        expect(res === "''a");
    });
});
