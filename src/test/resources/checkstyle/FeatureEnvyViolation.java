package checkstyle;

/**
 * Test case for Feature Envy check - fails validation.
 * Parameters are accessed more than 50 times, triggering a violation.
 */
public class FeatureEnvyViolation {
	/**
	 * Method with excessive parameter access (51 accesses - should trigger violation).
	 */
	void processDataExcessively(DataObject data) {
		int v1 = data.getValue();
		int v2 = data.getValue();
		int v3 = data.getValue();
		int v4 = data.getValue();
		int v5 = data.getValue();
		int v6 = data.getValue();
		int v7 = data.getValue();
		int v8 = data.getValue();
		int v9 = data.getValue();
		int v10 = data.getValue();
		int v11 = data.getValue();
		int v12 = data.getValue();
		int v13 = data.getValue();
		int v14 = data.getValue();
		int v15 = data.getValue();
		int v16 = data.getValue();
		int v17 = data.getValue();
		int v18 = data.getValue();
		int v19 = data.getValue();
		int v20 = data.getValue();
		int v21 = data.getValue();
		int v22 = data.getValue();
		int v23 = data.getValue();
		int v24 = data.getValue();
		int v25 = data.getValue();
		int v26 = data.getValue();
		int v27 = data.getValue();
		int v28 = data.getValue();
		int v29 = data.getValue();
		int v30 = data.getValue();
		int v31 = data.getValue();
		int v32 = data.getValue();
		int v33 = data.getValue();
		int v34 = data.getValue();
		int v35 = data.getValue();
		int v36 = data.getValue();
		int v37 = data.getValue();
		int v38 = data.getValue();
		int v39 = data.getValue();
		int v40 = data.getValue();
		int v41 = data.getValue();
		int v42 = data.getValue();
		int v43 = data.getValue();
		int v44 = data.getValue();
		int v45 = data.getValue();
		int v46 = data.getValue();
		int v47 = data.getValue();
		int v48 = data.getValue();
		int v49 = data.getValue();
		int v50 = data.getValue();
		int v51 = data.getValue();
	}

	static class DataObject {
		public int getValue() {
			return 0;
		}
	}
}
