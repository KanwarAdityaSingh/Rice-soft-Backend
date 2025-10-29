import { Router } from 'express';
import { LeadController } from '../controllers/lead.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const leadController = new LeadController();

// Apply authentication middleware to all routes
router.use(authenticate);

// Lead CRUD routes
router.get('/getAllLeads', leadController.getAll.bind(leadController));
router.get('/getLeadAnalytics', leadController.getAnalytics.bind(leadController));
router.get('/getLeadById/:id', leadController.getById.bind(leadController));
router.post('/createLead', leadController.create.bind(leadController));
router.post('/updateLead/:id', leadController.update.bind(leadController));
router.post('/deleteLead/:id', leadController.delete.bind(leadController));

// Lead events routes
router.get('/getLeadEvents/:id', leadController.getEvents.bind(leadController));
router.post('/addLeadEvent', leadController.addEvent.bind(leadController));

// Lead conversion routes
router.post('/convertLead', leadController.convert.bind(leadController));
router.post('/convertLeadToVendor', leadController.convertLeadToVendor.bind(leadController));

export default router;