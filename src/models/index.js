// Central export file for all Mongoose models
// This ensures all models are registered with Mongoose at server startup

import User from "./User.js";
import Job from "./Job.js";
import Proposal from "./Proposal.js";
import Contract from "./Contract.js";
import Conversation from "./Conversation.js";
import Message from "./Message.js";
import AdminSettings from "./AdminSettings.js";
import EnvironmentVariable from "./EnvironmentVariable.js";
import Wallet from "./Wallet.js";
import Escrow from "./Escrow.js";
import Transaction from "./Transaction.js";
import WithdrawalRequest from "./WithdrawalRequest.js";

export { User, Job, Proposal, Contract, Conversation, Message, AdminSettings, EnvironmentVariable, Wallet, Escrow, Transaction, WithdrawalRequest };

export default {
  User,
  Job,
  Proposal,
  Contract,
  Conversation,
  Message,
  AdminSettings,
  EnvironmentVariable,
  Wallet,
  Escrow,
  Transaction,
  WithdrawalRequest,
};
