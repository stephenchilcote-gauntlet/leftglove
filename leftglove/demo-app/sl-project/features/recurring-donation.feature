Feature: Recurring donation option
  A donor can enable monthly recurring donations when pledging to a campaign.

  Scenario: Donor can enable monthly recurring donation
    Given :test enables recurring donations via 'http://localhost:3000/set-recurring'
    And :test opens the browser to 'http://localhost:3000/fundraiser'
    When :test clicks Fundraiser.donate-button
    And :test clicks Fundraiser.recurring-checkbox
    And :test fills Fundraiser.amount-input with '25'
    And :test fills Fundraiser.name-input with 'Alice'
    And :test clicks Fundraiser.pledge-submit
    Then :test should see Fundraiser.title
