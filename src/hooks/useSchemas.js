import { useContext } from "react";
import { SchemasContext } from "../context/SchemasContext";

export default function useSchemas() {
  return useContext(SchemasContext);
}
