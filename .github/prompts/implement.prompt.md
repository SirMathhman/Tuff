---
name: implement
description: To implement a new language feature
---

Follow these steps exactly. This is a variant of TDD. You must tell the user when you start each step. Use your #tool:todo list.

1. Implement a failing test. If this test passes, then write another test that fails. Write enough tests for "robustness" if they seem to continue to pass.

2. Implement the minimum code to make the test pass in `main.tuff`. Do not implement in main.js. Do not use the feature requested (because it hasn't been implemented yet). Remember, `compileTuffToJS` takes in Tuff code and produces JS. `compileTuffToJS` does NOT take in JavaScript.
3. Rebuild such that the changes in `main.tuff` are compiled to `main.js`. 

- If `main.js` becomes malformed, restore it from version control. Version control always has a "working" compiler. Furthermore, there is no issue with restoring main.js, it is generated and will be overwritten regardless.
- If the build fails, notice the error message. It must provide the following information: what was the cause? what is the reason why this error occured? how to fix it? information around the error. You are required to improve this error message if it does not satisfy this criteria.
- If the warnings or error messages are legitimate, then refactor 

4. Run the tests to make them pass. If they do not pass, fix the code in `main.tuff` and repeat from step 2.
5. Update main.tuff to use the new feature.
6. Commit.
