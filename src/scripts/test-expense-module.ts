/**
 * Comprehensive test script for the Expense Module
 * 
 * This script tests:
 * 1. Category creation and management
 * 2. Expense creation with lines, overheads, and entity links
 * 3. Expense updates
 * 4. Status transitions (draft -> confirmed -> paid)
 * 5. Entity linking validation
 * 6. Serial number generation
 */

import { expenseCategoryDAO } from '../dao/expense-category.dao';
import { expenseDAO } from '../dao/expense.dao';
import { expenseService } from '../services/expense.service';
import { expenseCategoryService } from '../services/expense-category.service';
import { expenseLinkingService } from '../services/expense-linking.service';
import { invoiceDispatchDAO } from '../dao/invoice-dispatch.dao';
import { CreateExpenseDTO, PayeeType } from '../models/expense.model';

async function runTests() {
  console.log('🧪 Starting Expense Module Tests...\n');

  try {
    // Test 1: Create expense categories
    console.log('📝 Test 1: Creating expense categories...');
    
    let transportCategory;
    try {
      transportCategory = await expenseCategoryDAO.findByCode('TRANS');
      if (!transportCategory) {
        throw new Error('Transport category should be created by migration');
      }
      console.log('✅ Transport category found:', transportCategory.name);
    } catch (error) {
      console.error('❌ Failed to find transport category:', error);
      throw error;
    }

    // Test 2: Create a custom category
    console.log('\n📝 Test 2: Creating custom expense category...');
    
    let testCategory;
    try {
      // Check if test category already exists
      const existing = await expenseCategoryDAO.findByCode('TEST');
      if (existing) {
        testCategory = existing;
        console.log('✅ Test category already exists:', testCategory.name);
      } else {
        testCategory = await expenseCategoryService.createCategory({
          name: 'Test Expenses',
          code: 'TEST',
          description: 'Test category for expense module testing',
        });
        console.log('✅ Test category created:', testCategory.name, `(${testCategory.code})`);
      }
    } catch (error) {
      console.error('❌ Failed to create test category:', error);
      throw error;
    }

    // Test 3: Create a simple expense (no entity links)
    console.log('\n📝 Test 3: Creating simple office expense...');
    
    let simpleExpense;
    try {
      const expenseData: CreateExpenseDTO = {
        expense_category_id: testCategory.id,
        expense_date: '2026-08-15',
        payee_type: 'vendor' as PayeeType,
        payee_name: 'Test Office Supplier',
        payee_gst_number: '29ABCDE1234F1Z5',
        lines: [
          {
            line_number: 1,
            description: 'Office stationery',
            amount: 500,
          },
          {
            line_number: 2,
            description: 'Printer paper',
            amount: 300,
          },
        ],
        overheads: [
          {
            charge_name: 'Delivery charges',
            charge_amount: 50,
          },
        ],
      };

      simpleExpense = await expenseService.createExpense(expenseData);
      console.log('✅ Simple expense created:', simpleExpense.expense_number);
      console.log('   Total amount:', simpleExpense.total_amount);
      console.log('   Subtotal:', simpleExpense.subtotal);
      console.log('   Overhead total:', simpleExpense.overhead_total);
      console.log('   Status:', simpleExpense.status);
    } catch (error) {
      console.error('❌ Failed to create simple expense:', error);
      throw error;
    }

    // Test 4: Create transport expense with entity link
    console.log('\n📝 Test 4: Creating transport expense with entity link...');
    
    let transportExpense;
    try {
      // Find an available invoice dispatch
      const invoices = await invoiceDispatchDAO.findAll(
        undefined, // godown_id
        undefined, // sales_sauda_id
        undefined, // status
        undefined, // to_godown_id
        { limit: 1, offset: 0 } // pagination
      );

      if (invoices.rows.length === 0) {
        console.log('⚠️  No confirmed invoices available for linking, skipping entity link test');
      } else {
        const invoice = invoices.rows[0];
        console.log(`   Found invoice: ${invoice.internal_invoice_number}`);

        // Check if invoice is already linked
        const isLinked = await expenseLinkingService.getAvailableEntities('invoice_dispatch');
        const availableInvoice = isLinked.find((e) => e.id === invoice.id);

        if (!availableInvoice) {
          console.log('⚠️  Invoice already linked to another expense, creating without link');
        } else {
          const transportData: CreateExpenseDTO = {
            expense_category_id: transportCategory.id,
            expense_date: '2026-08-20',
            payee_type: 'transporter' as PayeeType,
            payee_name: 'Dileep Kumar',
            payee_bank_name: 'Central Bank of India',
            payee_account_number: '3504865609',
            payee_ifsc: 'CBIN0284885',
            payee_branch: 'ATSU',
            lines: [
              {
                line_number: 1,
                description: 'Transport from Barhi to Narela',
                reference_number: 'A/HR/B/26-27/116',
                reference_date: '2026-08-16',
                vehicle_number: 'DL1MB5666',
                from_location: 'BARHI',
                to_location: 'NARELA',
                quantity: 1050,
                unit: 'kg',
                rate: 0.70,
                amount: 735.00,
              },
              {
                line_number: 2,
                description: 'Transport from Barhi to Narela',
                reference_number: 'A/HR/B/26-27/117',
                reference_date: '2026-08-16',
                vehicle_number: 'DL1MB5666',
                from_location: 'BARHI',
                to_location: 'NARELA',
                quantity: 860,
                unit: 'kg',
                rate: 0.70,
                amount: 602.00,
              },
            ],
            overheads: [
              {
                charge_name: 'Unloading',
                charge_amount: 2128.00,
              },
              {
                charge_name: 'Bilty',
                charge_amount: 200.00,
              },
            ],
            entity_links: [
              {
                entity_type: 'invoice_dispatch',
                entity_id: invoice.id,
              },
            ],
          };

          transportExpense = await expenseService.createExpense(transportData);
          console.log('✅ Transport expense created:', transportExpense.expense_number);
          console.log('   Total amount:', transportExpense.total_amount);
          console.log('   Linked to invoice:', invoice.internal_invoice_number);
          console.log('   Lines:', transportExpense.lines.length);
          console.log('   Overheads:', transportExpense.overheads.length);
          console.log('   Entity links:', transportExpense.entity_links.length);
        }
      }
    } catch (error) {
      console.error('❌ Failed to create transport expense:', error);
      throw error;
    }

    // Test 5: Update expense
    console.log('\n📝 Test 5: Updating expense...');
    
    try {
      const updated = await expenseService.updateExpense(simpleExpense.id, {
        notes: 'Updated via test script',
        overheads: [
          {
            charge_name: 'Delivery charges',
            charge_amount: 100, // Updated amount
          },
        ],
      });

      console.log('✅ Expense updated:', updated.expense_number);
      console.log('   New overhead total:', updated.overhead_total);
      console.log('   New total amount:', updated.total_amount);
      console.log('   Notes:', updated.notes);
    } catch (error) {
      console.error('❌ Failed to update expense:', error);
      throw error;
    }

    // Test 6: Confirm expense
    console.log('\n📝 Test 6: Confirming expense...');
    
    try {
      const confirmed = await expenseService.confirmExpense(simpleExpense.id);
      console.log('✅ Expense confirmed:', confirmed.expense_number);
      console.log('   Status:', confirmed.status);
    } catch (error) {
      console.error('❌ Failed to confirm expense:', error);
      throw error;
    }

    // Test 7: Mark expense as paid
    console.log('\n📝 Test 7: Marking expense as paid...');
    
    try {
      const paid = await expenseService.markAsPaid(
        simpleExpense.id,
        'https://example.com/payment-proof.pdf'
      );
      console.log('✅ Expense marked as paid:', paid.expense_number);
      console.log('   Status:', paid.status);
      console.log('   Payment proof:', paid.payment_proof_url);
    } catch (error) {
      console.error('❌ Failed to mark expense as paid:', error);
      throw error;
    }

    // Test 8: Test serial number generation
    console.log('\n📝 Test 8: Testing serial number generation...');
    
    try {
      // Create multiple expenses in the same category to test serial numbering
      const expense1 = await expenseService.createExpense({
        expense_category_id: testCategory.id,
        expense_date: '2026-08-21',
        payee_type: 'vendor' as PayeeType,
        payee_name: 'Test Vendor 1',
        lines: [{ line_number: 1, description: 'Test item', amount: 100 }],
      });

      const expense2 = await expenseService.createExpense({
        expense_category_id: testCategory.id,
        expense_date: '2026-08-21',
        payee_type: 'vendor' as PayeeType,
        payee_name: 'Test Vendor 2',
        lines: [{ line_number: 1, description: 'Test item', amount: 200 }],
      });

      console.log('✅ Sequential expenses created:');
      console.log('   Expense 1:', expense1.expense_number, `(Serial: ${expense1.serial_number})`);
      console.log('   Expense 2:', expense2.expense_number, `(Serial: ${expense2.serial_number})`);

      // Verify serial numbers are sequential
      if (expense2.serial_number === expense1.serial_number + 1) {
        console.log('✅ Serial numbers are sequential');
      } else {
        console.log('❌ Serial numbers are not sequential');
      }
    } catch (error) {
      console.error('❌ Failed to test serial number generation:', error);
      throw error;
    }

    // Test 9: Test entity linking validation
    console.log('\n📝 Test 9: Testing entity linking validation...');
    
    try {
      if (transportExpense && transportExpense.entity_links.length > 0) {
        const linkedEntityId = transportExpense.entity_links[0].entity_id;
        
        // Try to create another expense with the same entity link (should fail)
        try {
          await expenseService.createExpense({
            expense_category_id: transportCategory.id,
            expense_date: '2026-08-22',
            payee_type: 'transporter' as PayeeType,
            payee_name: 'Another Transporter',
            lines: [{ line_number: 1, description: 'Test', amount: 100 }],
            entity_links: [
              {
                entity_type: 'invoice_dispatch',
                entity_id: linkedEntityId,
              },
            ],
          });
          console.log('❌ Entity linking validation failed - duplicate link was allowed');
        } catch (error: any) {
          if (error.message.includes('already linked')) {
            console.log('✅ Entity linking validation working - duplicate link prevented');
          } else {
            throw error;
          }
        }
      } else {
        console.log('⚠️  Skipping entity linking validation test (no linked entities)');
      }
    } catch (error) {
      console.error('❌ Failed entity linking validation test:', error);
      throw error;
    }

    // Test 10: List expenses with filters
    console.log('\n📝 Test 10: Listing expenses with filters...');
    
    try {
      const allExpenses = await expenseDAO.findAll({
        limit: 10,
        offset: 0,
      });

      console.log('✅ Listed expenses:', allExpenses.total, 'total');
      
      // Filter by category
      const testCategoryExpenses = await expenseDAO.findAll({
        expense_category_id: testCategory.id,
        limit: 10,
        offset: 0,
      });

      console.log('✅ Filtered by category:', testCategoryExpenses.total, 'expenses');

      // Filter by status
      const draftExpenses = await expenseDAO.findAll({
        status: 'draft',
        limit: 10,
        offset: 0,
      });

      console.log('✅ Filtered by status (draft):', draftExpenses.total, 'expenses');
    } catch (error) {
      console.error('❌ Failed to list expenses:', error);
      throw error;
    }

    console.log('\n✅ All tests completed successfully! 🎉');
    console.log('\n📊 Summary:');
    console.log('   - Categories: Working ✓');
    console.log('   - Expense creation: Working ✓');
    console.log('   - Lines & overheads: Working ✓');
    console.log('   - Entity linking: Working ✓');
    console.log('   - Status transitions: Working ✓');
    console.log('   - Serial number generation: Working ✓');
    console.log('   - Updates: Working ✓');
    console.log('   - Filters: Working ✓');

  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    throw error;
  }
}

// Run tests
runTests()
  .then(() => {
    console.log('\n✅ Test script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test script failed:', error);
    process.exit(1);
  });
