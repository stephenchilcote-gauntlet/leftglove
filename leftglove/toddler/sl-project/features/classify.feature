Feature: Classify elements
  Keyboard shortcuts classify the current element and advance
  to the next unclassified one.

  Background:
    Given :test opens the browser to 'http://localhost:8080?api=http://localhost:3333'
    And :test clears ToddlerLoop.url-input
    And :test fills ToddlerLoop.url-input with 'http://localhost:3000/login'
    And :test clicks ToddlerLoop.navigate
    And pause for 5 seconds
    And :test should see ToddlerLoop.status with text 'elements'

  Scenario: Classify via keyboard shortcut
    When :test presses c
    Then :test should see ToddlerLoop.classified-count with text '1 classified'

  Scenario: Classify via button click
    When :test clicks ToddlerLoop.cat-typable
    Then :test should see ToddlerLoop.classified-count with text '1 classified'

  Scenario: Multiple classifications increment count
    When :test presses c
    And :test presses r
    And :test presses x
    Then :test should see ToddlerLoop.classified-count with text '3 classified'
