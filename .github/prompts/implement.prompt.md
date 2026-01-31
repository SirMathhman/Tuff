---
name: implement
description: To implement a new language feature
---

Follow these steps exactly. This is a variant of TDD. You must tell the user when you start each step.

1. Implement a failing test.
2. Implement the minimum code to make the test pass in `main.tuff`. Do not implement in main.js. Remember, `compileTuffToJS` takes in Tuff code and produces JS. `compileTuffToJS` does NOT take in JavaScript.
3. Rebuild such that the changes in `main.tuff` are compileTuffToJSd to `main.js`. If `main.js` becomes malformed, restore it from version control.
4. Run the tests to make them pass. If they do not pass, fix the code in `main.tuff` and repeat from step 2.
5. Update main.tuff to use the new feature.
6. Commit.
