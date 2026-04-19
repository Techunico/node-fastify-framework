export const sendWelcomeEmailListener = {
  event: 'user.created',
  async: true,

  handler: async (payload: any) => {
    console.log('Send welcome email to:', payload.email);
  },
};