package checkstyle;

/**
 * Test case for Feature Envy check - passes validation.
 * Parameters are accessed 50 times or fewer, so no violation should be triggered.
 */
public class FeatureEnvyOk {
	/**
	 * Method with acceptable parameter usage (5 accesses).
	 */
	void processData(DataObject data) {
		int value1 = data.getValue();
		int value2 = data.getValue();
		int value3 = data.getValue();
		int value4 = data.getValue();
		int value5 = data.getValue();
	}

	/**
	 * Method with parameter at threshold (50 accesses - exactly at limit, should pass).
	 */
	void analyzeObject(DataObject obj) {
		int v1 = obj.getValue();
		int v2 = obj.getValue();
		int v3 = obj.getValue();
		int v4 = obj.getValue();
		int v5 = obj.getValue();
		int v6 = obj.getValue();
		int v7 = obj.getValue();
		int v8 = obj.getValue();
		int v9 = obj.getValue();
		int v10 = obj.getValue();
		int v11 = obj.getValue();
		int v12 = obj.getValue();
		int v13 = obj.getValue();
		int v14 = obj.getValue();
		int v15 = obj.getValue();
		int v16 = obj.getValue();
		int v17 = obj.getValue();
		int v18 = obj.getValue();
		int v19 = obj.getValue();
		int v20 = obj.getValue();
		int v21 = obj.getValue();
		int v22 = obj.getValue();
		int v23 = obj.getValue();
		int v24 = obj.getValue();
		int v25 = obj.getValue();
		int v26 = obj.getValue();
		int v27 = obj.getValue();
		int v28 = obj.getValue();
		int v29 = obj.getValue();
		int v30 = obj.getValue();
		int v31 = obj.getValue();
		int v32 = obj.getValue();
		int v33 = obj.getValue();
		int v34 = obj.getValue();
		int v35 = obj.getValue();
		int v36 = obj.getValue();
		int v37 = obj.getValue();
		int v38 = obj.getValue();
		int v39 = obj.getValue();
		int v40 = obj.getValue();
		int v41 = obj.getValue();
		int v42 = obj.getValue();
		int v43 = obj.getValue();
		int v44 = obj.getValue();
		int v45 = obj.getValue();
		int v46 = obj.getValue();
		int v47 = obj.getValue();
		int v48 = obj.getValue();
		int v49 = obj.getValue();
		int v50 = obj.getValue();
	}

	static class DataObject {
		public int getValue() {
			return 0;
		}
	}
}
