Feature: Recurring donation option
  A donor can enable monthly recurring donations when pledging to a campaign.

  Scenario: Donor can enable monthly recurring donation
    Given :test opens the browser to 'http://localhost:3000/set-recurring?enabled=true'
    When :test clicks Fundraiser.recurring-checkbox
    And :test clicks Fundraiser.donate-button
    And :test fills Fundraiser.amount-input with '25'
    And :test fills Fundraiser.name-input with 'Alice'
    Then :test should see Fundraiser.title
