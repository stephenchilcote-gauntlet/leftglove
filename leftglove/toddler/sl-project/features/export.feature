Feature: Export classifications
  The Export button downloads a JSON file containing the current
  element inventory with classification data.

  Background:
    Given :test opens the browser to 'http://localhost:8080?api=http://localhost:3333'
    And :test clears ToddlerLoop.url-input
    And :test fills ToddlerLoop.url-input with 'http://localhost:3000/login'
    And :test clicks ToddlerLoop.navigate
    And pause for 5 seconds
    And :test should see ToddlerLoop.status with text 'elements'

  Scenario: Export button is present after sieve
    Then :test should see ToddlerLoop.export

  Scenario: Classify then export
    When :test presses c
    And :test clicks ToddlerLoop.export
    # Export triggers a file download — verifying downloaded content
    # requires a custom step or post-hoc file check.
    Then :test should see ToddlerLoop.classified-count with text '1 classified'
