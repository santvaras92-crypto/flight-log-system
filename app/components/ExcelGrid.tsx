"use client";
import { useEffect, useRef, useState } from "react";
import { HotTable } from "@handsontable/react";
import Handsontable from "handsontable";
import "handsontable/dist/handsontable.full.min.css";
import { HyperFormula } from "hyperformula";
import { registerAllModules } from 'handsontable/registry';

registerAllModules();

type Props = {
  gridKey: string;
  initialData?: any[][];
  initialNamedExpressions?: { name: string; expression: string }[];
  onSave?: (matrix: any[][], formulas: any[][], namedExpressions: any[]) => Promise<void>;
};

export default function ExcelGrid({ gridKey, initialData, initialNamedExpressions, onSave }: Props) {
  const hotRef = useRef<HotTable>(null);
  const [data, setData] = useState<any[][]>(initialData ?? []);
  const [namedExpressions, setNamedExpressions] = useState(initialNamedExpressions ?? []);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/grids/${gridKey}`);
        const json = await res.json();
        setData(json.matrix ?? initialData ?? []);
        setNamedExpressions(json.namedExpressions ?? initialNamedExpressions ?? []);
      } catch (error) {
        console.error('Error loading grid:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [gridKey]);

  async function saveAll() {
    const hot = hotRef.current?.hotInstance;
    if (!hot) return;
    
    const all = hot.getData();
    const metaMatrix = all.map((row, r) => row.map((_, c) => hot.getCellMeta(r, c)?.formula ?? null));
    
    if (onSave) {
      await onSave(all, metaMatrix, namedExpressions);
    } else {
      await fetch(`/api/grids/${gridKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matrix: all, formulas: metaMatrix, namedExpressions }),
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Cargando...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex gap-3 flex-wrap">
        <button className="btn-executive btn-executive-primary" onClick={saveAll}>
          💾 Guardar
        </button>
        <button className="btn-executive btn-executive-secondary" onClick={() => {
          const hot = hotRef.current?.hotInstance;
          hot?.alter("insert_row_below", hot.countRows()-1);
        }}>
          ➕ Fila
        </button>
        <button className="btn-executive btn-executive-secondary" onClick={() => {
          const hot = hotRef.current?.hotInstance;
          hot?.alter("insert_col_end");
        }}>
          ➕ Columna
        </button>
        <button className="btn-executive btn-executive-secondary" onClick={() => {
          const hot = hotRef.current?.hotInstance;
          hot?.undo();
        }}>
          ↩️ Deshacer
        </button>
        <button className="btn-executive btn-executive-secondary" onClick={() => {
          const hot = hotRef.current?.hotInstance;
          hot?.redo();
        }}>
          ↪️ Rehacer
        </button>
      </div>

      <div className="executive-card overflow-hidden">
        <HotTable
          ref={hotRef}
          data={data}
          licenseKey="non-commercial-and-evaluation"
          rowHeaders
          colHeaders
          contextMenu
          dropdownMenu
          filters
          manualColumnMove
          manualRowMove
          manualColumnResize
          manualRowResize
          fillHandle
          comments
          formulas={{ engine: HyperFormula }}
          afterChange={(changes) => {
            if (!changes) return;
            clearTimeout((window as any).__gridSaveTimer);
            (window as any).__gridSaveTimer = setTimeout(saveAll, 800);
          }}
          height="70vh"
          className="bg-white"
        />
      </div>

      {namedExpressions.length > 0 && (
        <div className="mt-4 executive-card p-4">
          <label className="block text-sm font-semibold mb-3 text-gray-700">Variables Globales</label>
          <div className="flex gap-4 flex-wrap">
            {namedExpressions.map((ne, i) => (
              <div key={ne.name} className="flex items-center gap-2">
                <span className="text-gray-700 font-mono font-semibold">{ne.name}:</span>
                <input
                  className="executive-input w-32"
                  defaultValue={ne.expression}
                  onBlur={(e) => {
                    const copy = [...namedExpressions];
                    copy[i] = { ...copy[i], expression: e.target.value };
                    setNamedExpressions(copy);
                    saveAll();
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
