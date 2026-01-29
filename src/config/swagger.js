import swaggerJSDoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "SkillUp API",
      version: "1.0.0",
      description: "API documentation for Skill-Up platform - A freelance marketplace connecting clients with skilled professionals in Pakistan",
      contact: {
        email: "support@skillup.com",
      },
    },
    servers: [
      {
        url: "http://localhost:5000",
        description: "Development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string" },
          },
        },
        User: {
          type: "object",
          properties: {
            _id: { type: "string" },
            name: { type: "string" },
            email: { type: "string" },
            role: { type: "string", enum: ["client", "freelancer", "admin"] },
            isVerified: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Job: {
          type: "object",
          properties: {
            _id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            budget: { type: "number" },
            category: { type: "string" },
            skills: { type: "array", items: { type: "string" } },
            status: { type: "string", enum: ["open", "in_progress", "completed", "closed"] },
            client: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Proposal: {
          type: "object",
          properties: {
            _id: { type: "string" },
            job: { type: "string" },
            freelancer: { type: "string" },
            coverLetter: { type: "string" },
            bidAmount: { type: "number" },
            estimatedDuration: { type: "string" },
            status: { type: "string", enum: ["pending", "accepted", "rejected", "withdrawn"] },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Contract: {
          type: "object",
          properties: {
            _id: { type: "string" },
            job: { type: "string" },
            client: { type: "string" },
            freelancer: { type: "string" },
            proposal: { type: "string" },
            amount: { type: "number" },
            status: { type: "string", enum: ["pending", "active", "completed", "cancelled", "disputed"] },
            milestones: { type: "array", items: { $ref: "#/components/schemas/Milestone" } },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Milestone: {
          type: "object",
          properties: {
            _id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            amount: { type: "number" },
            dueDate: { type: "string", format: "date-time" },
            status: { type: "string", enum: ["pending", "funded", "in_progress", "completed", "approved"] },
          },
        },
        Message: {
          type: "object",
          properties: {
            _id: { type: "string" },
            conversation: { type: "string" },
            sender: { type: "string" },
            content: { type: "string" },
            attachments: { type: "array", items: { type: "string" } },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Conversation: {
          type: "object",
          properties: {
            _id: { type: "string" },
            participants: { type: "array", items: { type: "string" } },
            lastMessage: { $ref: "#/components/schemas/Message" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Notification: {
          type: "object",
          properties: {
            _id: { type: "string" },
            user: { type: "string" },
            type: { type: "string" },
            message: { type: "string" },
            isRead: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Review: {
          type: "object",
          properties: {
            _id: { type: "string" },
            contract: { type: "string" },
            reviewer: { type: "string" },
            reviewee: { type: "string" },
            rating: { type: "number", minimum: 1, maximum: 5 },
            comment: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Dispute: {
          type: "object",
          properties: {
            _id: { type: "string" },
            contract: { type: "string" },
            raisedBy: { type: "string" },
            reason: { type: "string" },
            description: { type: "string" },
            status: { type: "string", enum: ["open", "under_review", "resolved", "rejected"] },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Wallet: {
          type: "object",
          properties: {
            balance: { type: "number" },
            currency: { type: "string", default: "PKR" },
            pendingAmount: { type: "number" },
          },
        },
        Transaction: {
          type: "object",
          properties: {
            _id: { type: "string" },
            user: { type: "string" },
            type: { type: "string", enum: ["deposit", "withdrawal", "escrow_fund", "escrow_release", "escrow_refund"] },
            amount: { type: "number" },
            status: { type: "string", enum: ["pending", "completed", "failed"] },
            createdAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
    tags: [
      { name: "Auth", description: "Authentication and authorization endpoints" },
      { name: "Jobs", description: "Job posting and management" },
      { name: "Proposals", description: "Proposal submission and management" },
      { name: "Contracts", description: "Contract management and milestones" },
      { name: "Messages", description: "Messaging and conversations" },
      { name: "Profile", description: "User profile management" },
      { name: "Users", description: "User discovery and public profiles" },
      { name: "Notifications", description: "User notifications" },
      { name: "Reviews", description: "Reviews and ratings" },
      { name: "Payments", description: "Payment and wallet operations" },
      { name: "Disputes", description: "Contract disputes" },
      { name: "CNIC", description: "CNIC verification" },
      { name: "Settings", description: "User settings" },
      { name: "Admin - Users", description: "Admin user management" },
      { name: "Admin - Jobs", description: "Admin job management" },
      { name: "Admin - Analytics", description: "Admin analytics and reports" },
      { name: "Admin - Audit Logs", description: "Admin audit logs" },
      { name: "Admin - Permissions", description: "Admin permissions" },
      { name: "Admin - Settings", description: "Admin settings management" },
      { name: "Admin - Health", description: "Admin system health monitoring" },
      { name: "Admin - Env Vars", description: "Admin environment variables" },
      { name: "Admin - Payments", description: "Admin payment management" },
    ],
  },
  apis: ["./src/modules/**/*.routes.js", "./src/app.js"],
};

const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;
