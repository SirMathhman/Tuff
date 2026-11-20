// Reports an interface whose body has more than MAX_MEMBERS members. Fields,
// methods, index signatures, and call signatures all count.

const MAX_MEMBERS = 10;

const maxInterfaceMembers = {
  meta: {
    type: "suggestion",
    docs: { description: "Interfaces may have at most 10 members." },
    schema: [],
    messages: {
      tooMany: 'Interface "{{name}}" has {{count}} members; the maximum is 10.',
    },
  },
  create(context) {
    return {
      TSInterfaceDeclaration(node) {
        const { id } = node;
        const { body: members } = node.body;
        const count = members.length;
        if (count > MAX_MEMBERS) {
          context.report({
            node,
            messageId: "tooMany",
            data: { name: id.name, count },
          });
        }
      },
    };
  },
};

export default maxInterfaceMembers;
