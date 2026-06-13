import { prisma } from '../db/prisma';

type SourceCategoryRow = {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  category: string;
  programs: number;
};

type SourceCategoryGroupRow = {
  sourceId: string | null;
  category: string | null;
  _count: {
    _all: number;
  };
};

type UncategorizedSourceGroupRow = {
  sourceId: string | null;
  _count: {
    _all: number;
  };
};

export async function getSourceCategories() {
  const [
    sources,
    categoryRows,
    uncategorizedRows
  ] = await Promise.all([
    prisma.source.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        enabled: true
      },
      orderBy: {
        priority: 'asc'
      }
    }),
    prisma.program.groupBy({
      by: ['sourceId', 'category'],
      where: {
        sourceId: {
          not: null
        },
        category: {
          not: null
        }
      },
      _count: {
        _all: true
      },
      orderBy: [
        {
          sourceId: 'asc'
        },
        {
          _count: {
            category: 'desc'
          }
        }
      ]
    }),
    prisma.program.groupBy({
      by: ['sourceId'],
      where: {
        sourceId: {
          not: null
        },
        category: null
      },
      _count: {
        _all: true
      }
    })
  ]);

  const typedCategoryRows: SourceCategoryGroupRow[] = categoryRows;
  const typedUncategorizedRows: UncategorizedSourceGroupRow[] = uncategorizedRows;
  const sourcesById = new Map(
    sources.map((source) => [source.id, source])
  );
  const rows: SourceCategoryRow[] = typedCategoryRows.flatMap((row) => {
    if (!row.sourceId) return [];

    const source = sourcesById.get(row.sourceId);

    return [{
      sourceId: row.sourceId,
      sourceName: source?.name ?? 'Unknown source',
      sourceType: source?.type ?? 'unknown',
      category: row.category ?? 'Uncategorized',
      programs: row._count._all
    }];
  });

  for (const row of typedUncategorizedRows) {
    if (!row.sourceId) continue;

    const source = sourcesById.get(row.sourceId);

    rows.push({
      sourceId: row.sourceId,
      sourceName: source?.name ?? 'Unknown source',
      sourceType: source?.type ?? 'unknown',
      category: 'Uncategorized',
      programs: row._count._all
    });
  }

  const summary = sources.map((source) => {
    const sourceRows = rows
      .filter((row) => row.sourceId === source.id)
      .sort((a, b) => b.programs - a.programs);
    const totalPrograms = sourceRows.reduce(
      (sum, row) => sum + row.programs,
      0
    );

    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      enabled: source.enabled,
      categories: sourceRows.length,
      programs: totalPrograms,
      topCategories: sourceRows.slice(0, 8).map((row) => `${row.category} (${row.programs})`).join(', ')
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    sources: summary,
    categories: rows.sort((a, b) =>
      a.sourceName.localeCompare(b.sourceName) ||
      b.programs - a.programs ||
      a.category.localeCompare(b.category)
    )
  };
}
