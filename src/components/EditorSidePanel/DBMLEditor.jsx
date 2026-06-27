import { useEffect, useState } from "react";
import { useDiagram, useEnums, useSchemas } from "../../hooks";
import { toDBML } from "../../utils/exportAs/dbml";
import CodeEditor from "../CodeEditor";

export default function DBMLEditor() {
  const { tables: currentTables, relationships } = useDiagram();
  const diagram = useDiagram();
  const { enums } = useEnums();
  const { schemas } = useSchemas();
  const [value, setValue] = useState(() =>
    toDBML({ ...diagram, enums, schemas }),
  );

  useEffect(() => {
    setValue(toDBML({ tables: currentTables, enums, relationships, schemas }));
  }, [currentTables, enums, relationships, schemas]);

  return (
    <CodeEditor
      showCopyButton
      value={value}
      language="dbml"
      onChange={setValue}
      height="100%"
      options={{
        readOnly: true,
        minimap: { enabled: false },
      }}
    />
  );
}
