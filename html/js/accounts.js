"use strict";

#var app_utils, app_view, app_ajax, app_main;

var app_utils = {
    /* Utility function for debugging */
    object_to_text: function(o)
    {
        var text = '';
        for (var key in o)
        {
            var value = o[key];
            if (typeof value === 'function')
                value = 'function';

            text += key += ' = ' + o[key] + "\n";
        }

        return text;
    },

    money_add: function(a, b)
    {
        return (parseFloat(a) + parseFloat(b)).toFixed(2);
    },
};

/* ---------------------------------------------------------------------- */

var app_data = {
    year       : 2000,
    month      : 1,
    account_id : 1,

    accounts_by_id : null,
    accounts_by_name : null,
    accounts_by_type_name : null,

    transactions : null,
};

/* ---------------------------------------------------------------------- */

var app_ajax = {

    server_prefix : '/cgi-bin/sa2/ajax/',

    event_handlers : {
        on_accounts_loaded : function(data) {},

        on_ajax_error : function(message, context)
        { app_view.set_status(message + ': ' + context.responseText); },
    },

    initialize : function(handlers)
    { this.event_handlers = handlers; },

    load_accounts : function()
    {
        $.ajax({
            type : 'GET',
            url : this.server_prefix + 'accounts',
            context : this,

            success : this.events.on_accounts_loaded,

            error: function(context)
            { this.events.on_ajax_error('loading accounts', context); }
        });
    },
};

/* ---------------------------------------------------------------------- */

var app_view = {
    show_account_navigation : function()
    {
        // render template
        var template_source = $('#template-account-navigation').html();
        var template = Handlebars.compile(template_source);

        var html_output = template({
            year: app_data.year,
            month: app_data.month,
            accounts_by_name: this.accounts_by_name
        });

        $('#display').html(html_output);

        // and set up listeners
        var outer_this = this;
        $('#display .account-link').click(
            function(e)
            {
                e.preventDefault();
                outer_this.follow_account_link($(this));
            });

        $('#display .account-selector').change(
            function()
            {
                var $this = this;
                $this.load_account_month_details($(this).val());
            });

        this.set_status('ready');
    },

    set_status : function(status)
    {
        $('#status').text(status);
    },
};

/* ---------------------------------------------------------------------- */

var app_main = {
    year : 2000,
    month: 1,
    account_id: 0,

    tallies : { pending:0, cleared:0 },

    month_names: ['month0',
                  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],

    /* Entry point: set status, initialize templates and date,
     * then fetch account data from server.
     */
    initialize : function()
    {
        let outer_this = this;
        app_ajax.initialize({
            on_accounts_loaded : function(accounts) {
                app_data.accounts_by_id = accounts.accounts_by_id;
                app_data.accounts_by_name = accounts.accounts_by_name;
                app_data.accounts_by_type_name = accounts.accounts_by_type_name;
                app_view.show_account_navigation();
            },

        });


        this.set_status('initializing');
        this.register_helpers();
        this.initialize_month();

        $.ajax({
            type : 'GET',
            url: '/cgi-bin/sa2/ajax/accounts',
            context: this,
            success : function(result)
            {
                this.accounts_by_id = result.accounts_by_id;
                this.accounts_by_name = result.accounts_by_name;
                this.accounts_by_type_name = result.accounts_by_type_name;
                this.set_status('have accounts');
                this.show_account_navigation();
            },

            error : function(a)
            {
                this.set_status('initialization failed: ' + a.responseText);
            },
        });
    },

    /* Date initialization: we start on current month */
    initialize_month: function()
    {
        var today = new Date();
        this.year = today.getYear() + 1900;
        this.month = today.getMonth() + 1;
    },

    /* Register template helpers and partials */
    register_helpers: function()
    {
        var outer_this = this;

        Handlebars.registerHelper('if_eq', function(a, b, opts) {
            if (a == b) {
                return opts.fn(this);
            } else {
                return opts.inverse(this);
            }
        });

        var partial_config = {
            account_title      : '#partial-account-title',
            account_link       : '#partial-account-link',
            account_navigation : '#partial-account-navigation',
            transaction_table  : '#partial-transaction-table',
            account_selector   : '#partial-account-selector',
            menu_account_detail: '#partial-menu-account-detail',
            menu_other_accounts: '#partial-menu-other-accounts',
            menu_other_months  : '#partial-menu-other-months',
        };

        for (var name in partial_config)
        {
            var id = partial_config[name];
            console.log('name='+name+', id='+id);
            Handlebars.registerPartial(name, $(id).html());
        }

        Handlebars.registerPartial(
            'pending_balance', function() {
                return outer_this.tallies.pending; });

        Handlebars.registerPartial(
            'cleared_balance', function() {
                return outer_this.tallies.cleared; });

        Handlebars.registerPartial(
            'tally_transaction', function(transaction) {
                var amount = parseFloat(transaction.amount);
                if (transaction.from_id === outer_this.account_id)
                    amount *= -1;
                outer_this.tallies.pending = (parseFloat(outer_this.tallies.pending) + amount).toFixed(2);
                if (transaction.status === 'cleared')
                    outer_this.tallies.cleared = (parseFloat(outer_this.tallies.cleared) + amount).toFixed(2);
                return '';
            });

        Handlebars.registerHelper(
            'status_selector', function(current_status) {
                let options = [];
                for (let i = 0; i < outer_this.all_statuses.length; i++)
                {
                    let status = outer_this.all_statuses[i];
                    var option = '<option';
                    if (status === current_status)
                        option += ' selected';
                    option += '>' + status + '</option>';
                    options.push(option);
                }
                return new Handlebars.SafeString(
                    "<select class='status-selector'>" +
                        options.join('') +
                        '</select>');
            });

        Handlebars.registerHelper(
            'month_name',function(month_number) {
                return outer_this.month_names[month_number];
            });

        Handlebars.registerHelper(
            'other_account', function(transaction, account_id) {
                var other_id = transaction.from_id;
                if (account_id == transaction.from_id)
                    other_id = transaction.to_id;
                return outer_this.accounts_by_id[other_id];
            });
    },

    /* Follow an account link. $link should be the anchor tag, and have
     * the apprpriate account ID, year, and month attribute values.
     */
    follow_account_link: function($link)
    {
        var id    = $link.attr('data-id');
        var year  = $link.attr('data-year');
        var month = $link.attr('data-month');
        this.load_account_month_details(id, year, month);

    },

    show_account_navigation : function()
    {
        // render template
        var template_source = $('#template-account-navigation').html();
        var template = Handlebars.compile(template_source);

        var html_output = template({
            year: this.year,
            month: this.month,
            accounts_by_name: this.accounts_by_name
        });

        $('#display').html(html_output);

        // and set up listeners
        var outer_this = this;
        $('#display .account-link').click(
            function(e)
            {
                e.preventDefault();
                outer_this.follow_account_link($(this));
            });

        $('#display .account-selector').change(
            function()
            {
                var $this = this;
                $this.load_account_month_details($(this).val());
            });

        this.set_status('ready');
    },

    load_account_month_details : function(id, year, month)
    {
        this.account_id = id;
        this.year       = year;
        this.month      = month;

        this.set_status('Loading ' + this.accounts_by_id[id].name);
        $.ajax({
            type: 'GET',
            url: '/cgi-bin/sa2/ajax/transactions',
            context: this,
            cache: false,

            data : {
                id    : this.account_id,
                year  : this.year,
                month : this.month,
            },

            success : function(result)
            {
                this.show_account_month_details(result);
            },

            error : function(a, b, c)
            {
                this.set_status('failed to fetch account transactions: ' +
                                a.responseText);
            },
        });
    },

    /* Called when the user changes the value in the status selector
     * of a transaction. Tell the database to change to the new value.
     */
    update_transaction_status: function($tr, new_status)
    {
        this.set_status('status change pending');

        // Get the transaction identity from tr attribute values
        let date_posted = $tr.attr('data-date-posted');
        let from_id     = $tr.attr('data-from-id');
        let to_id       = $tr.attr('data-to-id');
        let id          = $tr.attr('data-id');

        // and ask the database to update the value
        let outer_this = this;
        $.ajax({
            type: 'PUT',
            url: '/cgi-bin/sa2/ajax/transaction',
            context: this,
            contentType: 'application/x-www-form-urlencoded; charset=UTF-8',

            data : {
                'date_posted' : date_posted,
                'from_id'     : from_id,
                'to_id'       : to_id,
                'id'          : id,
                'status'      : new_status
            },

            // If success, reload and redisplay the transactions.
            // A better way would be to cache the transactions locally,
            // update in place and redisplay
            success : function(result)
            {
                outer_this.set_status('status change succeeded');
                outer_this.load_account_month_details(
                    outer_this.account_id,
                    outer_this.year,
                    outer_this.month);
            },
                
            error : function(a)
            {
                outer_this.set_status('status change failed: ' +
                                      a.status + ' ' + a.statusText);
            },
        });

    },

    show_account_month_details: function(transactions)
    {
        // initialize tallies
        this.tallies = {
            pending : parseFloat(transactions.pending_balance).toFixed(2),
            cleared : parseFloat(transactions.cleared_balance).toFixed(2),
        };

        this.all_statuses = transactions.all_statuses;

        // render template
        var template_source = $('#template-account-details').html();
        if (!template_source)
        { this.set_status('template not found') ; return ; }

        transactions.account_name =
            this.accounts_by_id[transactions.account_id].name;
        transactions.accounts_by_id = this.accounts_by_id;
        transactions.accounts_by_type_name = this.accounts_by_type_name;

        var template = Handlebars.compile(template_source);
        var html_output = template(transactions);
        $('#display').html(html_output);

        // set up listeners
        var outer_this = this;
        $('#display .account-link').click(
            function(e)
            {
                e.preventDefault();
                outer_this.follow_account_link($(this));
            });

        $('#reload').click(
            function(e)
            {
                e.preventDefault();
                outer_this.load_account_month_details(
                    outer_this.account_id,
                    outer_this.year,
                    outer_this.month);
            });

        $('#display .account-selector').change(
            function(e)
            {
                outer_this.load_account_month_details(
                    this.value,
                    outer_this.year,
                    outer_this.month);
            });

        $('#display .status-selector').change(
            function(e)
            {
                outer_this.update_transaction_status(
                    $(this).closest('tr'), this.value);
            });

        $('#add-new-transaction-button').click(
            function()
            {
                $('#add-new-transaction-dialog').dialog();
            });

        this.set_status('ready');
    },

    set_status : function(status)
    {
        $('#status').text(status);
    },
};

$(document).ready(function() { app_main.initialize() });
