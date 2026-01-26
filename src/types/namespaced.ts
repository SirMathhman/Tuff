export type NamespacedStoreEntry = {
  scope: Map<string, number>;
  typeMap: Map<string, number>;
  mutMap: Map<string, boolean>;
  visMap: Map<string, boolean>;
};

export type NamespacedSetter = (
  name: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  visMap: Map<string, boolean>,
) => void;
